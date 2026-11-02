import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { registerCall } from "../registerCall"
import { provideServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The same send arriving twice at once, on a real Postgres (PGlite has one
// connection and runs them one after the other): the repeat waits for the
// customer's lock, then finds the first arrival's `call` row and gets its
// response (esiti-richiami-stati AC11, D5)

const NOW = new Date("2026-11-02T09:00:00.000Z")

describe.skipIf(!hasTestDatabase)("registerCall su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it.effect(
    "lo stesso invio arrivato due volte insieme registra una chiamata e dà la stessa risposta (AC11)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const { operator, customer, contact } = yield* Effect.promise(
          async () => {
            const operator = await createOperator()
            const customer = await createCustomer({ operatorId: operator.id })
            const contact = await createTask({
              customerId: customer.id,
              operatorId: operator.id,
              state: "chiamare",
            })
            return { operator, customer, contact }
          }
        )
        const send = registerCall({
          taskId: contact.id,
          actor: { operatorId: operator.id, role: "OPERATORE" },
          requestId: crypto.randomUUID(),
          source: "detail",
          outcome: "richiamare",
          callback: { day: "2026-11-05", message: "Sera" },
        }).pipe(provideServer, Effect.exit)

        // A colleague holds the customer: both arrivals start their
        // transaction and queue on the lock, so they really overlap
        const colleague = yield* Effect.promise(() =>
          holdCustomerLock(customer.id)
        )
        const first = yield* Effect.forkChild(send)
        const second = yield* Effect.forkChild(send)
        yield* Effect.promise(() => waitUntilBlocked(2))
        yield* Effect.promise(() => colleague.release())
        const a = yield* Fiber.join(first)
        const b = yield* Fiber.join(second)

        expect(Exit.isSuccess(a)).toBe(true)
        expect(Exit.isSuccess(b)).toBe(true)
        expect(Exit.isSuccess(a) && Exit.isSuccess(b) && b.value).toEqual(
          Exit.isSuccess(a) && a.value
        )
        expect(
          yield* Effect.promise(() =>
            pgDb
              .select({
                action: taskEventLog.action,
                fromState: taskEventLog.fromState,
                toState: taskEventLog.toState,
              })
              .from(taskEventLog)
              .where(eq(taskEventLog.customerId, customer.id))
          )
        ).toEqual([
          { action: "call", fromState: "chiamare", toState: "richiamare" },
        ])
        const [row] = yield* Effect.promise(() =>
          pgDb.select().from(task).where(eq(task.id, contact.id))
        )
        expect(row).toMatchObject({ state: "richiamare", closedAt: NOW })
        expect(
          yield* Effect.promise(() =>
            pgDb
              .select({ id: alert.id })
              .from(alert)
              .where(eq(alert.taskId, contact.id))
          )
        ).toHaveLength(1)
      })
  )
})
