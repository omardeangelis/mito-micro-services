import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { lockCustomer, transaction } from "../../../effect/db"
import { replaceActiveContact } from "../activeContact"
import {
  activeTasksOf,
  LEGACY_SCHEMA_TAG,
  migrateUpTo,
  resetDb,
} from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { provideServer } from "@/test/effect"

// Customers with more than one active task: the data PR2 cleans up. The schema
// stops before the unique index that forbids them.

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
})

beforeEach(async () => {
  await resetDb()
})

describe("replaceActiveContact su un cliente con due task attive", () => {
  it.effect(
    "le disattiva entrambe e restituisce come previous la più recente",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: operator.id })
        )
        yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            state: "app.to",
            updatedAt: new Date("2026-09-01T09:00:00.000Z"),
            createdAt: new Date("2026-09-01T09:00:00.000Z"),
          })
        )
        const newer = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            state: "richiamare",
            updatedAt: new Date("2026-09-10T09:00:00.000Z"),
            createdAt: new Date("2026-09-01T09:00:00.000Z"),
          })
        )

        const exit = yield* transaction(
          Effect.flatMap(lockCustomer(customer.id), (locked) =>
            replaceActiveContact({
              customer: locked,
              values: { state: "chiamare", operatorId: operator.id },
            })
          )
        ).pipe(provideServer, Effect.exit)
        if (exit._tag === "Failure")
          throw new Error("replaceActiveContact failed")
        const { created, previous } = exit.value

        expect(previous).toMatchObject({ id: newer.id, state: "richiamare" })
        expect(yield* Effect.promise(() => activeTasksOf(customer.id))).toEqual(
          [created]
        )
      })
  )
})
