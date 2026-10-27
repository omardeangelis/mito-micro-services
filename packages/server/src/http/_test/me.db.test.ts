import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  NotAnOperator,
  OperatorDisabled,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { ApiHandlersLive } from "../api"
import { SessionReader } from "../session"

/** The session the backend read for the request: `userId`'s, or none */
const sessionOf = (userId: string | null) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed(
        userId === null
          ? null
          : { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" }
      ),
  })

/** The client of the group `me`, on the real handlers and the test database */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["me"]).pipe(
    Effect.provide(ApiHandlersLive),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/me", () => {
  it.effect("restituisce ruolo, operatore e preferenze di un operatore", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ name: "Ada", surname: "Lovelace" })
      )
      yield* Effect.promise(() =>
        testDb
          .update(users)
          .set({ preferences: JSON.stringify({ dashboardCollapsed: true }) })
          .where(eq(users.id, operator.userId))
      )
      const api = yield* clientAs(operator.userId)

      const me = yield* api.me.getCurrentUser()

      assert.strictEqual(me.role, "OPERATORE")
      assert.strictEqual(me.operatorId, operator.id)
      assert.strictEqual(me.operator.id, operator.id)
      assert.strictEqual(me.operator.name, "Ada")
      assert.strictEqual(me.operator.surname, "Lovelace")
      assert.strictEqual(me.operator.userId, operator.userId)
      assert.instanceOf(me.operator.createdAt, Date)
      assert.strictEqual(
        me.operator.createdAt.toISOString(),
        operator.createdAt.toISOString()
      )
      assert.deepStrictEqual(me.preferences, { dashboardCollapsed: true })
    })
  )

  it.effect("un admin ha il ruolo ADMIN", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const api = yield* clientAs(admin.userId)

      const me = yield* api.me.getCurrentUser()

      assert.strictEqual(me.role, "ADMIN")
      assert.deepStrictEqual(me.preferences, {})
    })
  )

  it.effect("senza sessione è Unauthorized (401)", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(api.me.getCurrentUser())

      assert.isTrue(error instanceof Unauthorized)
    })
  )

  it.effect("un operatore disattivato è OperatorDisabled (401)", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ disabledAt: new Date() })
      )
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(api.me.getCurrentUser())

      assert.isTrue(error instanceof OperatorDisabled)
    })
  )

  it.effect("un utente senza operatore è NotAnOperator (400)", () =>
    Effect.gen(function* () {
      const user = yield* Effect.promise(() => createUser())
      const api = yield* clientAs(user.id)

      const error = yield* Effect.flip(api.me.getCurrentUser())

      assert.isTrue(error instanceof NotAnOperator)
    })
  )
})

describe("PATCH /api/v1/me", () => {
  it.effect("scrive nome e cognome dell'operatore della sessione", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() => createOperator())
      const other = yield* Effect.promise(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const updated = yield* api.me.updateOperatorInfo({
        payload: { name: "Grace", surname: "Hopper" },
      })

      assert.strictEqual(updated.id, operator.id)
      assert.strictEqual(updated.name, "Grace")
      assert.strictEqual(updated.surname, "Hopper")
      assert.strictEqual(updated.role, "OPERATORE")
      const rows = yield* Effect.promise(() =>
        testDb
          .select({ id: operators.id, name: operators.name })
          .from(operators)
          .orderBy(operators.id)
      )
      assert.deepStrictEqual(rows, [
        { id: operator.id, name: "Grace" },
        { id: other.id, name: other.name },
      ])
    })
  )

  it.effect("senza sessione non scrive niente", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() => createOperator())
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(
        api.me.updateOperatorInfo({ payload: { name: "Grace" } })
      )

      assert.isTrue(error instanceof Unauthorized)
      const [row] = yield* Effect.promise(() =>
        testDb
          .select({ name: operators.name })
          .from(operators)
          .where(eq(operators.id, operator.id))
      )
      assert.strictEqual(row?.name, operator.name)
    })
  )
})
