import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  CallbackChanged,
  TransitionRejected,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
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

describe("POST /api/v1/task/alerts/:id/remove", () => {
  it.effect(
    "chiude l'alert con resolution removed e porta lo stesso contatto allo stato scelto",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator.id, "richiamare")
        const open = yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: new Date("2026-11-10T08:00:00.000Z"),
          })
        )
        const api = yield* clientAs(operator.userId)

        const removed = yield* api.task.removeCallback({
          params: { id: open.id },
          payload: { taskId: contact.id, state: "app.to" },
        })

        assert.deepStrictEqual(removed, { taskId: contact.id, state: "app.to" })
        const [row] = yield* given(() =>
          testDb.select().from(task).where(eq(task.id, contact.id))
        )
        assert.deepInclude(row, { state: "app.to", alertId: null })
        const [closed] = yield* given(() =>
          testDb.select().from(alert).where(eq(alert.id, open.id))
        )
        assert.deepInclude(closed, { isResolved: true, resolution: "removed" })
      })
  )

  it.effect("dà gli errori nelle classi del contratto", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id, "richiamare")
      const open = yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: new Date("2026-11-10T08:00:00.000Z"),
        })
      )
      const remove = (
        userId: string | null,
        alertId: number,
        state: TaskStatus
      ) =>
        Effect.flip(
          clientAs(userId).pipe(
            Effect.flatMap((api) =>
              api.task.removeCallback({
                params: { id: alertId },
                payload: { taskId: contact.id, state },
              })
            )
          )
        )

      assert.deepStrictEqual(
        yield* remove(operator.userId, open.id, "richiamare"),
        new TransitionRejected({ from: "richiamare", to: "richiamare" })
      )
      assert.instanceOf(
        yield* remove(operator.userId, open.id + 1, "app.to"),
        CallbackChanged
      )
      assert.instanceOf(yield* remove(null, open.id, "app.to"), Unauthorized)
      const [row] = yield* given(() =>
        testDb.select().from(task).where(eq(task.id, contact.id))
      )
      assert.strictEqual(row?.state, "richiamare")
    })
  )
})
