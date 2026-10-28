import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { task } from "@mito/db/schema/task"
import {
  type LockedCustomer,
  lockCustomer,
  transaction,
} from "../../../effect/db"
import { replaceActiveContact } from "../activeContact"
import { activeTasksOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"
import { failureTag, provideServer } from "@/test/effect"
import { type ServerServices } from "@mito/server/effect/server"

// As the callers do: lock the customer, then replace its contact
const replaceExit = (customerId: string, operatorId?: number) =>
  transaction(
    Effect.flatMap(lockCustomer(customerId), (customer) =>
      replaceActiveContact({
        customer,
        values: { state: "chiamare", operatorId, priority: 120 },
      })
    )
  ).pipe(provideServer, Effect.exit)

const replace = (customerId: string, operatorId?: number) =>
  Effect.gen(function* () {
    const exit = yield* replaceExit(customerId, operatorId)
    if (exit._tag === "Failure") throw new Error("replaceActiveContact failed")
    return exit.value
  })

/** The program as the edges run it: with `ServerServices` and nothing else. */
const inServer = <A, E>(program: Effect.Effect<A, E, ServerServices>) =>
  program.pipe(provideServer, Effect.exit)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("replaceActiveContact", () => {
  it.effect(
    "un cliente senza task, dopo replaceActiveContact, ha un solo contatto attivo: quello creato",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: operator.id })
        )

        const { created, previous } = yield* replace(customer.id, operator.id)

        expect(previous).toBeNull()
        expect(created).toMatchObject({
          customerId: customer.id,
          state: "chiamare",
          operatorId: operator.id,
          priority: 120,
          isActive: true,
        })
        const [active] = yield* Effect.promise(() =>
          createTestCaller(operator).task.getActiveTask({
            id: customer.id,
          })
        )
        expect(active).toEqual(created)
        expect(
          yield* Effect.promise(() => activeTasksOf(customer.id))
        ).toHaveLength(1)
      })
  )

  it.effect(
    "un cliente con una task attiva: la precedente non è più attiva e torna come previous",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: operator.id })
        )
        const existing = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: operator.id,
            state: "app.to",
          })
        )

        const { created, previous } = yield* replace(customer.id, operator.id)

        expect(previous).toMatchObject({
          id: existing.id,
          state: "app.to",
          isActive: false,
        })
        expect(yield* Effect.promise(() => activeTasksOf(customer.id))).toEqual(
          [created]
        )
      })
  )

  it.effect(
    "un cliente inesistente fallisce con CustomerMissing senza scrivere nulla",
    () =>
      Effect.gen(function* () {
        const exit = yield* replaceExit("missing-customer")

        expect(failureTag(exit)).toBe("CustomerMissing")
        expect(yield* Effect.promise(() => testDb.select().from(task))).toEqual(
          []
        )
      })
  )

  it.effect(
    "se l'insert fallisce il DB resta com'era e il chiamante riceve un DbError",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: operator.id })
        )
        const existing = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: operator.id,
            state: "app.to",
          })
        )
        yield* Effect.promise(() => failNextInsertInto(task))

        const exit = yield* replaceExit(customer.id, operator.id)

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => tasksOf(customer.id))).toEqual([
          existing,
        ])
      })
  )

  // Checked by `tsc --noEmit`: the calls never run
  it.effect(
    "si chiama solo con un cliente bloccato da lockCustomer, dentro transaction()",
    () =>
      Effect.sync(() => {
        const values = { state: "chiamare" as const }
        const unlocked = { id: "customer", operatorId: null }
        const locked = {} as LockedCustomer

        const misuses = [
          // @ts-expect-error: only lockCustomer makes a LockedCustomer
          () => replaceActiveContact({ customer: unlocked, values }),
          // @ts-expect-error: only transaction() provides Tx
          () => inServer(replaceActiveContact({ customer: locked, values })),
        ]

        expect(misuses).toHaveLength(2)
      })
  )
})
