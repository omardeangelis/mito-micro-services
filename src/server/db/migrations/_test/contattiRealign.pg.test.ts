import { readFileSync } from "fs"
import path from "path"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgDb,
  pgClient,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"
import { REALIGN_SCHEMA_TAG } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// The realignment can run while operators work. On a real Postgres, a handover
// that commits after the migration read its rows (the customer on A, the
// contact on B) but before it updated them leaves the pair on the new
// operator: the migration skips that contact and writes no row for it. PGlite
// has one connection and can't show it.

const MIGRATION = path.resolve(__dirname, `../${REALIGN_SCHEMA_TAG}.sql`)

/** The statement that moves the contacts and writes the log (the second). */
const moveStatement = () => {
  const statements = readFileSync(MIGRATION, "utf8").split(
    "--> statement-breakpoint"
  )
  expect(statements).toHaveLength(2)
  return statements[1]!
}

describe.skipIf(!hasTestDatabase)(
  "contatti_contact_realign su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it("un passaggio di consegne che si chiude mentre la migrazione gira non viene sovrascritto, e non ha una riga di log", async () => {
      const system = await createSystemOperator()
      const anna = await createOperator({ name: "Anna" })
      const bruno = await createOperator({ name: "Bruno" })
      const xavier = await createOperator({ name: "Xavier" })
      const untouched = await createCustomer({ operatorId: anna.id })
      const untouchedTask = await createTask({
        customerId: untouched.id,
        operatorId: bruno.id,
      })
      const handedOver = await createCustomer({ operatorId: anna.id })
      const handedOverTask = await createTask({
        customerId: handedOver.id,
        operatorId: bruno.id,
      })

      // The handover to Xavier, as a colleague's call: customer and contact in
      // one transaction, not committed yet
      const handover = await holdCustomerLock(handedOver.id)
      await handover.db
        .update(customers)
        .set({ operatorId: xavier.id })
        .where(eq(customers.id, handedOver.id))
      await handover.db
        .update(task)
        .set({ operatorId: xavier.id })
        .where(eq(task.id, handedOverTask.id))

      // The migration reads the committed rows (the contact of `handedOver` is
      // still Bruno's, the customer's Anna) and waits for the contact's lock
      const migrating = Promise.resolve(pgClient.unsafe(moveStatement()))
      migrating.catch(() => undefined)
      await waitUntilBlocked(1)
      await handover.release()
      await migrating

      const rows = await pgDb.select().from(task).orderBy(asc(task.id))
      const operatorOf = (id: number) =>
        rows.find((row) => row.id === id)!.operatorId
      // Moved: nothing touched it
      expect(operatorOf(untouchedTask.id)).toBe(anna.id)
      // Left as the handover wrote it: the pair is aligned on Xavier
      expect(operatorOf(handedOverTask.id)).toBe(xavier.id)
      const [customer] = await pgDb
        .select()
        .from(customers)
        .where(eq(customers.id, handedOver.id))
      expect(customer!.operatorId).toBe(xavier.id)
      // The log has the row of the contact that moved, and only that one
      expect(await pgDb.select().from(taskEventLog)).toMatchObject([
        {
          taskId: untouchedTask.id,
          customerId: untouched.id,
          actorOperatorId: system.id,
          action: "operator_reassign",
          source: "bulk",
          fromOperatorId: bruno.id,
          toOperatorId: anna.id,
        },
      ])
    })
  }
)
