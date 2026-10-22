import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { actorOf } from "../../contact/actor"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { customers } from "@mito/db/schema/customers"
import { eq } from "drizzle-orm"
import { deactivateOperator } from "../deactivate"

// La disattivazione di un operatore (gestione-operatori, AC8, AC9, AC13)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const operatorOfCustomer = async (id: string) => {
  const [row] = await testDb
    .select({ operatorId: customers.operatorId })
    .from(customers)
    .where(eq(customers.id, id))
  return row?.operatorId
}

describe("deactivateOperator", () => {
  it("passa alla destinazione un cliente e il suo contatto attivo, con due righe operator_reassign di source deactivation", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    const customer = await createCustomer({ operatorId: leaving.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: leaving.id,
    })

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(exit).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(await operatorOfCustomer(customer.id)).toBe(target.id)
    const [moved] = await tasksOf(customer.id)
    expect(moved).toMatchObject({ id: contact.id, operatorId: target.id })
    const log = await logOf(customer.id)
    expect(log).toHaveLength(2)
    for (const row of log) {
      expect(row).toMatchObject({
        action: "operator_reassign",
        source: "deactivation",
        actorOperatorId: admin.id,
        fromOperatorId: leaving.id,
        toOperatorId: target.id,
      })
    }
    expect(log.map((row) => row.taskId).sort()).toEqual(
      [null, contact.id].sort()
    )
  })
})
