import { readdirSync, readFileSync } from "fs"
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
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// The realignment while operators work, on a real Postgres (PGlite has one
// connection and can't show it). The migration is run again on a database that
// has it, statement by statement in one transaction as the migrator does, and
// a colleague's call that has not committed yet is waiting on it.
//
// In the release session the index migration before this one already holds an
// ACCESS EXCLUSIVE lock on task until the COMMIT, so no write to task gets in
// between. These tests are for the migration run alone, where its own first
// statement (LOCK TABLE) is what keeps a handover that commits after the move
// read its rows from being undone.

const MIGRATIONS = path.resolve(__dirname, "..")
const statements = readFileSync(
  path.join(
    MIGRATIONS,
    readdirSync(MIGRATIONS).find((file) =>
      file.endsWith("_contatti_contact_realign.sql")
    )!
  ),
  "utf8"
).split("--> statement-breakpoint")

/** The migration as the migrator runs it: every statement, one transaction. */
const runMigration = () =>
  pgClient.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement)
  })

async function seedOperators() {
  const anna = await createOperator({ name: "Anna" })
  const system = await createSystemOperator()
  const bruno = await createOperator({ name: "Bruno" })
  const xavier = await createOperator({ name: "Xavier" })
  return { anna, system, bruno, xavier }
}

/**
 * Starts the migration while `colleague` holds its locks, waits until it is
 * queued behind them, then lets the colleague commit and the migration end.
 */
async function migrateBehind(colleague: { release: () => Promise<void> }) {
  const migrating = runMigration()
  migrating.catch(() => undefined)
  await waitUntilBlocked(1)
  await colleague.release()
  await migrating
}

const operatorOfTask = async (id: number) =>
  (await pgDb.select().from(task).where(eq(task.id, id)))[0]!.operatorId
const operatorOfCustomer = async (id: string) =>
  (await pgDb.select().from(customers).where(eq(customers.id, id)))[0]!
    .operatorId

describe.skipIf(!hasTestDatabase)(
  "contatti_contact_realign su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it("divide in tre istruzioni: il lock, la guardia e lo spostamento", () => {
      expect(statements).toHaveLength(3)
      expect(statements[0]).toMatch(
        /LOCK TABLE "mito-deutsche_task" IN EXCLUSIVE MODE/
      )
    })

    it("un passaggio di consegne che si chiude mentre la migrazione gira non viene sovrascritto, e non ha una riga di log", async () => {
      const { anna, system, bruno, xavier } = await seedOperators()
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

      await migrateBehind(handover)

      // Moved: nothing touched it
      expect(await operatorOfTask(untouchedTask.id)).toBe(anna.id)
      // Left as the handover wrote it: the pair is aligned on Xavier
      expect(await operatorOfTask(handedOverTask.id)).toBe(xavier.id)
      expect(await operatorOfCustomer(handedOver.id)).toBe(xavier.id)
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

    it("un passaggio di consegne all'operatore che il contatto ha già, che sposta solo il cliente, non viene annullato", async () => {
      const { anna, bruno } = await seedOperators()
      const customer = await createCustomer({ operatorId: anna.id })
      const contact = await createTask({
        customerId: customer.id,
        operatorId: bruno.id,
      })

      // As the handover does: the customer, then the contact, which it only
      // locks because it is Bruno's already; then the customer moves to Bruno
      const handover = await holdCustomerLock(customer.id)
      await handover.db
        .select()
        .from(task)
        .where(eq(task.id, contact.id))
        .for("update")
      await handover.db
        .update(customers)
        .set({ operatorId: bruno.id })
        .where(eq(customers.id, customer.id))

      await migrateBehind(handover)

      expect(await operatorOfCustomer(customer.id)).toBe(bruno.id)
      expect(await operatorOfTask(contact.id)).toBe(bruno.id)
      expect(await pgDb.select().from(taskEventLog)).toEqual([])
    })

    it("un contatto riaperto mentre la migrazione gira: quello non attivo resta com'era", async () => {
      const { anna, bruno, xavier } = await seedOperators()
      const customer = await createCustomer({ operatorId: anna.id })
      const closed = await createTask({
        customerId: customer.id,
        operatorId: bruno.id,
        state: "richiamare",
      })

      // The reopening (AC34) of a customer handed to Xavier: the old contact
      // becomes inactive and a new active one is created for him
      const reopening = await holdCustomerLock(customer.id)
      await reopening.db
        .update(task)
        .set({ isActive: false })
        .where(eq(task.id, closed.id))
      const [reopened] = await reopening.db
        .insert(task)
        .values({
          customerId: customer.id,
          operatorId: xavier.id,
          state: "chiamare",
          isActive: true,
        })
        .returning()
      await reopening.db
        .update(customers)
        .set({ operatorId: xavier.id })
        .where(eq(customers.id, customer.id))

      await migrateBehind(reopening)

      // History keeps whoever worked it; the new contact is Xavier's, like
      // the customer
      expect(await operatorOfTask(closed.id)).toBe(bruno.id)
      expect(await operatorOfTask(reopened!.id)).toBe(xavier.id)
      expect(await operatorOfCustomer(customer.id)).toBe(xavier.id)
      expect(await pgDb.select().from(taskEventLog)).toEqual([])
      expect(
        (await pgDb.select().from(task).orderBy(asc(task.id))).map(
          (row) => row.isActive
        )
      ).toEqual([false, true])
    })
  }
)
