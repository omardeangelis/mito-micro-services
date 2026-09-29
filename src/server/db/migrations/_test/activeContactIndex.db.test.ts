import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { lockCustomer, transaction } from "@/server/effect/db"
import { replaceActiveContact } from "@/server/services/contact/activeContact"
import {
  activeTasksOf,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { runServer } from "@/test/effect"

// After PR2 the database itself keeps one active contact per customer (AC71)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/** The Postgres error code a promise rejects with. */
const sqlState = (promise: Promise<unknown>) =>
  promise.then(
    () => "no error",
    (error: { code?: string }) => error.code
  )

describe("indice unico sui contatti attivi", () => {
  it("il database rifiuta un secondo contatto attivo per lo stesso cliente", async () => {
    const customer = await createCustomer()
    await createTask({ customerId: customer.id })

    expect(await sqlState(createTask({ customerId: customer.id }))).toBe(
      "23505"
    )
    expect(await activeTasksOf(customer.id)).toHaveLength(1)
  })

  it("rifiuta anche la riattivazione di un contatto superato", async () => {
    // What updateTask does today when the list sends isActive: true on an old
    // row (review of PR1, F3; runbook G2, step 9)
    const customer = await createCustomer()
    const superseded = await createTask({
      customerId: customer.id,
      isActive: false,
    })
    await createTask({ customerId: customer.id })

    expect(
      await sqlState(
        testDb
          .update(task)
          .set({ isActive: true })
          .where(eq(task.id, superseded.id))
      )
    ).toBe("23505")
  })

  it("ammette più task attive senza cliente, e più task non attive per cliente", async () => {
    await createTask({ customerId: null })
    await createTask({ customerId: null })
    const customer = await createCustomer()
    await createTask({ customerId: customer.id, isActive: false })
    await createTask({ customerId: customer.id, isActive: false })
    await createTask({ customerId: customer.id })

    expect(await activeTasksOf(customer.id)).toHaveLength(1)
  })

  it("replaceActiveContact continua a sostituire il contatto attivo", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    await createTask({ customerId: customer.id, state: "app.to" })

    const exit = await runServer(
      transaction(
        Effect.flatMap(lockCustomer(customer.id), (locked) =>
          replaceActiveContact({
            customer: locked,
            values: { state: "chiamare", operatorId: operator.id },
          })
        )
      )
    )
    if (exit._tag === "Failure") throw new Error("replaceActiveContact failed")

    expect(await activeTasksOf(customer.id)).toEqual([exit.value.created])
  })
})

describe("indici di prestazione", () => {
  it("esistono su task e alert", async () => {
    const { rows } = await testClient.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename IN ('mito-deutsche_task', 'mito-deutsche_alert')
       ORDER BY indexname`
    )

    expect(rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "alert_task_id_idx",
        "task_customer_id_idx",
        "task_operator_active_idx",
        "task_priority_active_idx",
      ])
    )
  })
})
