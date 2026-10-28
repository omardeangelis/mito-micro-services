import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  CannotDeactivateSelf,
  HandoverSameOperator,
  LastAdmin,
  NotAdmin,
  OperatorIsAdmin,
  OperatorNotFound,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { customers } from "@mito/db/schema/customers"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints of the admin tab of the profile (3.8), on the real handlers
// and database, as the tests of the procedures `operator.updateOperatorsRole`,
// `deactivate`, `getDeactivationImpact` and `getOperatorsForDeactivation`
// (gestione-operatori, AC1–AC6, AC13, AC18, AC21)

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

/** The client of the group `operator`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["operator"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

type Client = Effect.Success<ReturnType<typeof clientAs>>

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const roleOf = (userId: string) =>
  given(() =>
    testDb
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .then(([row]) => row?.role)
  )

const isDisabled = (userId: string) =>
  given(() =>
    testDb
      .select({ disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, userId))
      .then(([row]) => row?.disabledAt !== null)
  )

const operatorOfCustomer = (customerId: string) =>
  given(() =>
    testDb
      .select({ operatorId: customers.operatorId })
      .from(customers)
      .where(eq(customers.id, customerId))
      .then(([row]) => row?.operatorId)
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("solo gli admin", () => {
  /** Each endpoint of the tab, on operator 1 */
  const calls: [string, (api: Client) => Effect.Effect<unknown, unknown>][] = [
    [
      "updateOperatorsRole",
      (api) => api.operator.updateOperatorsRole({ payload: [] }),
    ],
    [
      "getDeactivationImpact",
      (api) =>
        api.operator.getDeactivationImpact({ params: { operatorId: 1 } }),
    ],
    [
      "getOperatorsForDeactivation",
      (api) =>
        api.operator.getOperatorsForDeactivation({ params: { operatorId: 1 } }),
    ],
    [
      "deactivate",
      (api) =>
        api.operator.deactivate({
          params: { operatorId: 1 },
          payload: { toOperatorId: 2 },
        }),
    ],
  ]

  it.effect.each(calls)("un OPERATORE che chiama %s è NotAdmin", ([, call]) =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      assert.instanceOf(yield* Effect.flip(call(api)), NotAdmin)
    })
  )

  it.effect.each(calls)("senza sessione %s è Unauthorized", ([, call]) =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      assert.instanceOf(yield* Effect.flip(call(api)), Unauthorized)
    })
  )
})

describe("PUT /operator/roles", () => {
  it.effect("cambia il ruolo degli operatori della lista e la dà com'è", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const promoted = yield* given(() => createOperator({ role: "OPERATORE" }))
      const demoted = yield* given(() => createOperator({ role: "ADMIN" }))
      const api = yield* clientAs(admin.userId)
      const input = [
        { id: promoted.id, role: "ADMIN" as const },
        { id: demoted.id, role: "OPERATORE" as const },
      ]

      const returned = yield* api.operator.updateOperatorsRole({
        payload: input,
      })

      assert.deepStrictEqual(returned, input)
      assert.strictEqual(yield* roleOf(promoted.userId), "ADMIN")
      assert.strictEqual(yield* roleOf(demoted.userId), "OPERATORE")
    })
  )

  it.effect("salta un id che non c'è e cambia gli altri", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const operator = yield* given(() => createOperator({ role: "ADMIN" }))
      const api = yield* clientAs(admin.userId)

      yield* api.operator.updateOperatorsRole({
        payload: [
          { id: operator.id + 1, role: "OPERATORE" },
          { id: operator.id, role: "OPERATORE" },
        ],
      })

      assert.strictEqual(yield* roleOf(operator.userId), "OPERATORE")
    })
  )

  it.effect(
    "l'unico admin che si declassa è LastAdmin e resta ADMIN (AC18)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)

        const error = yield* Effect.flip(
          api.operator.updateOperatorsRole({
            payload: [{ id: admin.id, role: "OPERATORE" }],
          })
        )

        assert.instanceOf(error, LastAdmin)
        assert.strictEqual(yield* roleOf(admin.userId), "ADMIN")
      })
  )

  it.effect("un operatore disattivato nella lista è OperatorNotFound", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const gone = yield* given(() =>
        createOperator({ role: "OPERATORE", disabledAt: new Date() })
      )
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.operator.updateOperatorsRole({
          payload: [{ id: gone.id, role: "ADMIN" }],
        })
      )

      assert.instanceOf(error, OperatorNotFound)
      assert.strictEqual(yield* roleOf(gone.userId), "OPERATORE")
    })
  )

  it.effect("un OPERATORE non cambia niente", () =>
    Effect.gen(function* () {
      const caller = yield* given(() => createOperator({ role: "OPERATORE" }))
      const target = yield* given(() => createOperator({ role: "OPERATORE" }))
      const api = yield* clientAs(caller.userId)

      yield* Effect.flip(
        api.operator.updateOperatorsRole({
          payload: [{ id: target.id, role: "ADMIN" }],
        })
      )

      assert.strictEqual(yield* roleOf(target.userId), "OPERATORE")
    })
  )
})

describe("POST /operator/:operatorId/deactivation", () => {
  it.effect(
    "sposta il portafoglio, disattiva l'utente e dà i tre conteggi",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const leaving = yield* given(() => createOperator())
        const target = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ operatorId: leaving.id })
        )
        const api = yield* clientAs(admin.userId)

        const result = yield* api.operator.deactivate({
          params: { operatorId: leaving.id },
          payload: { toOperatorId: target.id },
        })

        assert.deepStrictEqual(result, {
          customersMoved: 1,
          contactsMoved: 0,
          practicesMoved: 0,
        })
        assert.strictEqual(yield* operatorOfCustomer(customer.id), target.id)
        assert.isTrue(yield* isDisabled(leaving.userId))
      })
  )

  it.effect("su un ADMIN è OperatorIsAdmin (AC3)", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const otherAdmin = yield* given(() => createOperator({ role: "ADMIN" }))
      const target = yield* given(() => createOperator())
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.operator.deactivate({
          params: { operatorId: otherAdmin.id },
          payload: { toOperatorId: target.id },
        })
      )

      assert.instanceOf(error, OperatorIsAdmin)
      assert.isFalse(yield* isDisabled(otherAdmin.userId))
    })
  )

  it.effect(
    "un admin che disattiva se stesso è CannotDeactivateSelf (AC4)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const target = yield* given(() => createOperator())
        const api = yield* clientAs(admin.userId)

        const error = yield* Effect.flip(
          api.operator.deactivate({
            params: { operatorId: admin.id },
            payload: { toOperatorId: target.id },
          })
        )

        assert.instanceOf(error, CannotDeactivateSelf)
      })
  )

  it.effect(
    "un operatore che non c'è, o già disattivato, è OperatorNotFound",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const gone = yield* given(() =>
          createOperator({ disabledAt: new Date() })
        )
        const target = yield* given(() => createOperator())
        const api = yield* clientAs(admin.userId)

        const missing = yield* Effect.flip(
          api.operator.deactivate({
            params: { operatorId: target.id + 100 },
            payload: { toOperatorId: target.id },
          })
        )
        const disabled = yield* Effect.flip(
          api.operator.deactivate({
            params: { operatorId: gone.id },
            payload: { toOperatorId: target.id },
          })
        )

        assert.instanceOf(missing, OperatorNotFound)
        assert.instanceOf(disabled, OperatorNotFound)
      })
  )

  it.effect(
    "una destinazione disattivata è OperatorNotFound e non sposta niente",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const leaving = yield* given(() => createOperator())
        const gone = yield* given(() =>
          createOperator({ disabledAt: new Date() })
        )
        const customer = yield* given(() =>
          createCustomer({ operatorId: leaving.id })
        )
        const api = yield* clientAs(admin.userId)

        const error = yield* Effect.flip(
          api.operator.deactivate({
            params: { operatorId: leaving.id },
            payload: { toOperatorId: gone.id },
          })
        )

        assert.instanceOf(error, OperatorNotFound)
        assert.strictEqual(yield* operatorOfCustomer(customer.id), leaving.id)
        assert.isFalse(yield* isDisabled(leaving.userId))
      })
  )

  it.effect("la destinazione uguale all'operatore è HandoverSameOperator", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const leaving = yield* given(() => createOperator())
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.operator.deactivate({
          params: { operatorId: leaving.id },
          payload: { toOperatorId: leaving.id },
        })
      )

      assert.instanceOf(error, HandoverSameOperator)
    })
  )

  it.effect("un OPERATORE non disattiva nessuno", () =>
    Effect.gen(function* () {
      const caller = yield* given(() => createOperator({ role: "OPERATORE" }))
      const leaving = yield* given(() => createOperator())
      const target = yield* given(() => createOperator())
      const api = yield* clientAs(caller.userId)

      yield* Effect.flip(
        api.operator.deactivate({
          params: { operatorId: leaving.id },
          payload: { toOperatorId: target.id },
        })
      )

      assert.isFalse(yield* isDisabled(leaving.userId))
    })
  )
})

describe("GET /operator/:operatorId/deactivation", () => {
  it.effect(
    "conta clienti, contatti attivi e pratiche dell'operatore (AC21)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const leaving = yield* given(() => createOperator())
        const first = yield* given(() =>
          createCustomer({ operatorId: leaving.id })
        )
        yield* given(() => createCustomer({ operatorId: leaving.id }))
        yield* given(() => createCustomer({ operatorId: admin.id }))
        yield* given(() =>
          createTask({ customerId: first.id, operatorId: leaving.id })
        )
        yield* given(() =>
          createTask({
            customerId: first.id,
            operatorId: leaving.id,
            isActive: false,
          })
        )
        yield* given(() =>
          createPractice({ customerId: first.id, operatorId: leaving.id })
        )
        const api = yield* clientAs(admin.userId)

        const impact = yield* api.operator.getDeactivationImpact({
          params: { operatorId: leaving.id },
        })

        assert.deepStrictEqual(impact, {
          customers: 2,
          contacts: 1,
          practices: 1,
        })
      })
  )
})

describe("GET /operator/:operatorId/deactivation/targets", () => {
  it.effect(
    "gli operatori attivi tranne quello da disattivare, senza disattivati e sistema, per cognome e nome",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Anna", surname: "Zeta" })
        )
        const leaving = yield* given(() =>
          createOperator({ name: "Carla", surname: "Mura" })
        )
        const luca = yield* given(() =>
          createOperator({ name: "Luca", surname: "Alfa" })
        )
        const bruno = yield* given(() =>
          createOperator({ name: "Bruno", surname: "Alfa" })
        )
        yield* given(() =>
          createOperator({ name: "Ex", surname: "Dis", disabledAt: new Date() })
        )
        yield* given(() => createSystemOperator())
        const api = yield* clientAs(admin.userId)

        const targets = yield* api.operator.getOperatorsForDeactivation({
          params: { operatorId: leaving.id },
        })

        assert.deepStrictEqual(targets, [
          { id: bruno.id, name: "Bruno", surname: "Alfa" },
          { id: luca.id, name: "Luca", surname: "Alfa" },
          { id: admin.id, name: "Anna", surname: "Zeta" },
        ])
      })
  )
})
