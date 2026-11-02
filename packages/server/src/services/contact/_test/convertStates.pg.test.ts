import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { convertContactStates } from "../convertStates"
import { registerCall } from "../registerCall"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The conversion against a call on the same customer, on a real Postgres
// (PGlite has one connection and can't run them together): the conversion
// reads its contacts, then waits for the customer's lock behind the call
// (esiti-richiami-stati AC32, D11)

const NOW = new Date("2026-11-02T09:00:00.000Z")

describe.skipIf(!hasTestDatabase)(
  "convertContactStates e registerCall su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it.effect(
      "con una chiamata in parallelo sullo stesso cliente vince la chiamata",
      () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(NOW.getTime())
          const { operator, customer, contact } = yield* Effect.promise(
            async () => {
              await createSystemOperator()
              const operator = await createOperator()
              const customer = await createCustomer({
                operatorId: operator.id,
              })
              // Rule 3 of AC31: active, `richiamare`, no open alert
              const contact = await createTask({
                customerId: customer.id,
                operatorId: operator.id,
                state: "richiamare",
              })
              return { operator, customer, contact }
            }
          )

          // A colleague holds the customer: the call queues first, then the
          // conversion, which has already read the contact in `richiamare`
          const colleague = yield* Effect.promise(() =>
            holdCustomerLock(customer.id)
          )
          const calling = yield* registerCall({
            taskId: contact.id,
            actor: { operatorId: operator.id, role: "OPERATORE" },
            requestId: crypto.randomUUID(),
            source: "detail",
            outcome: "app.to",
          }).pipe(provideServer, Effect.exit, Effect.forkChild)
          yield* Effect.promise(() => waitUntilBlocked(1))
          const converting = yield* convertContactStates({
            budgetMs: 60_000,
          }).pipe(provideServer, Effect.exit, Effect.forkChild)
          yield* Effect.promise(() => waitUntilBlocked(2))

          yield* Effect.promise(() => colleague.release())
          const call = yield* Fiber.join(calling)
          const conversion = yield* Fiber.join(converting)

          expect(Exit.isSuccess(call)).toBe(true)
          expect(Exit.isSuccess(conversion) && conversion.value).toMatchObject({
            noAlert: 0,
            failed: 0,
          })
          const [row] = yield* Effect.promise(() =>
            pgDb.select().from(task).where(eq(task.id, contact.id))
          )
          expect(row).toMatchObject({ state: "app.to", closedAt: NOW })
          expect(
            yield* Effect.promise(() =>
              pgDb
                .select({ action: taskEventLog.action })
                .from(taskEventLog)
                .where(eq(taskEventLog.customerId, customer.id))
            )
          ).toEqual([{ action: "call" }])
        })
    )
  }
)
