import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import {
  activeTasksOf,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { createCustomer, createTask } from "@/test/factories"

// After PR2 the database itself keeps one active contact per customer (AC71).
// replaceActiveContact with the index in place: activeContact.db.test.ts

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("indice unico sui contatti attivi", () => {
  it("il database rifiuta un secondo contatto attivo per lo stesso cliente", async () => {
    const customer = await createCustomer()
    await createTask({ customerId: customer.id })

    await expect(createTask({ customerId: customer.id })).rejects.toMatchObject(
      { code: "23505" }
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

    await expect(
      testDb
        .update(task)
        .set({ isActive: true })
        .where(eq(task.id, superseded.id))
    ).rejects.toMatchObject({ code: "23505" })
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
})

describe("definizione degli indici di PR2", () => {
  it("coincide con quella che il runbook G2 confronta in prod (passo 6)", async () => {
    const { rows } = await testClient.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE indexname IN ('task_customer_active_uidx', 'task_customer_id_idx',
         'task_operator_active_idx', 'task_priority_active_idx', 'alert_task_id_idx')
       ORDER BY indexname`
    )

    expect(rows.map(({ indexdef }) => indexdef)).toEqual([
      'CREATE INDEX alert_task_id_idx ON public."mito-deutsche_alert" USING btree (task_id)',
      'CREATE UNIQUE INDEX task_customer_active_uidx ON public."mito-deutsche_task" USING btree (customer_id) WHERE is_active',
      'CREATE INDEX task_customer_id_idx ON public."mito-deutsche_task" USING btree (customer_id)',
      'CREATE INDEX task_operator_active_idx ON public."mito-deutsche_task" USING btree (operator_id) WHERE is_active',
      'CREATE INDEX task_priority_active_idx ON public."mito-deutsche_task" USING btree (priority DESC NULLS LAST) WHERE is_active',
    ])
  })
})
