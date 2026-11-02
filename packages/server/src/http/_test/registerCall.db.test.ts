import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  CallAlreadyWorked,
  CallNotAllowed,
  MessageTooLong,
  RequestIdConflict,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { type TaskStatus } from "@mito/domain/schemas"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")

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

/** The client of the group `task`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["task"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A customer of `operatorId` with an active contact of theirs in `state` */
const contactOf = (operatorId: number, state: TaskStatus = "chiamare") =>
  given(async () => {
    const customer = await createCustomer({ operatorId })
    const contact = await createTask({
      customerId: customer.id,
      operatorId,
      state,
    })
    return { customer, contact }
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("POST /api/v1/task/:id/call", () => {
  it.effect(
    "registra Richiamare e risponde con lo stato, l'alert aperto e la chiamata; la ripetizione ha la stessa risposta",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Neri" })
        )
        const { contact } = yield* contactOf(operator.id)
        const api = yield* clientAs(operator.userId)
        const request = {
          params: { id: contact.id },
          payload: {
            outcome: "richiamare" as const,
            requestId: crypto.randomUUID(),
            source: "detail" as const,
            callback: { day: "2026-11-05", message: "  Sera  " },
          },
        }

        const first = yield* api.task.registerCall(request)
        const again = yield* api.task.registerCall(request)

        assert.deepStrictEqual(again, first)
        assert.strictEqual(first.state, "richiamare")
        assert.deepInclude(first.alert, { day: "2026-11-05", message: "Sera" })
        assert.deepInclude(first.call, {
          outcome: "richiamare",
          origin: "list",
          by: "Ada Neri",
        })
        assert.strictEqual(first.call.at.getTime(), NOW.getTime())
        const [row] = yield* given(() =>
          testDb.select().from(task).where(eq(task.id, contact.id))
        )
        assert.strictEqual(row?.alertId, first.alert?.id)
      })
  )

  it.effect("dà gli errori nuovi nelle classi del contratto", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const colleague = yield* given(() =>
        createOperator({ name: "Carla", surname: "Bianchi" })
      )
      const open = yield* contactOf(operator.id)
      const done = yield* contactOf(operator.id, "app.to")
      const workedAt = new Date("2026-11-02T08:15:00.000Z")
      const worked = yield* given(() =>
        createAlert({
          taskId: done.contact.id,
          deadline: workedAt,
          isResolved: true,
          resolvedBy: colleague.id,
          resolvedAt: workedAt,
          resolution: "call",
        })
      )
      const api = yield* clientAs(operator.userId)
      const requestId = crypto.randomUUID()
      const call = (
        id: number,
        payload: Partial<{
          workingAlertId: number
          requestId: string
          message: string
        }> = {}
      ) =>
        Effect.flip(
          api.task.registerCall({
            params: { id },
            payload: {
              outcome: "richiamare",
              requestId: payload.requestId ?? crypto.randomUUID(),
              source: "list",
              workingAlertId: payload.workingAlertId,
              callback: { day: "2026-11-05", message: payload.message },
            },
          })
        )

      assert.deepStrictEqual(
        yield* call(done.contact.id, { workingAlertId: worked.id }),
        new CallAlreadyWorked({ by: "Carla Bianchi", at: workedAt })
      )
      assert.deepStrictEqual(
        yield* call(done.contact.id),
        new CallNotAllowed({ state: "app.to" })
      )
      assert.deepStrictEqual(
        yield* call(open.contact.id, { message: "x".repeat(501) }),
        new MessageTooLong()
      )
      yield* api.task.registerCall({
        params: { id: open.contact.id },
        payload: { outcome: "non risponde", requestId, source: "list" },
      })
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const asAdmin = yield* clientAs(admin.userId)
      assert.deepStrictEqual(
        yield* Effect.flip(
          asAdmin.task.registerCall({
            params: { id: open.contact.id },
            payload: { outcome: "non risponde", requestId, source: "list" },
          })
        ),
        new RequestIdConflict()
      )
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(
        api.task.registerCall({
          params: { id: contact.id },
          payload: {
            outcome: "app.to",
            requestId: crypto.randomUUID(),
            source: "detail",
          },
        })
      )

      assert.instanceOf(error, Unauthorized)
    })
  )
})
