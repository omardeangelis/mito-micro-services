import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { Db, type DbClient } from "../../../effect/db"
import { assignCustomers, handover } from "../../customer/assignment"
import { reassign } from "../reassign"
import { createTestCaller } from "@/test/caller"
import { failureTag, runServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The deactivation of an operator against the writers that move customers to
// them, on a real Postgres (PGlite has one connection and can't show it). The
// deactivation locks the operator's user row FOR UPDATE, then sets
// `disabled_at`; the writers check their target with `findWorkingOperator`
// (FOR KEY SHARE OF users) before they lock a customer: users first, then
// customers (gestione-operatori, AC7, AC11, AC15).

/**
 * The deactivation of the operator of `userId`, as a transaction of the test
 * on a connection of its own: it locks the user row (`locked` resolves once it
 * has it), and `disable` sets `disabled_at` and commits.
 */
function deactivation(userId: string) {
  let release!: () => void
  let onLocked!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const locked = new Promise<void>((resolve) => (onLocked = resolve))
  const done = pgClient.begin(async (tx) => {
    await tx`SELECT id FROM "mito-deutsche_user" WHERE id = ${userId} FOR UPDATE`
    onLocked()
    await gate
    await tx`UPDATE "mito-deutsche_user" SET disabled_at = now() WHERE id = ${userId}`
  })
  done.catch(() => undefined)
  return {
    locked,
    /** Sets `disabled_at` and commits. */
    disable: async () => {
      release()
      await done
    },
  }
}

/** The queries of the backends that wait for a lock. */
const waitingQueries = async () =>
  (
    await pgClient<{ query: string }[]>`
      SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
  ).map(({ query }) => query)

/** Whether another transaction holds the customer's row lock right now. */
const isCustomerLocked = (customerId: string) =>
  pgDb
    .transaction((tx) =>
      tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, customerId))
        .for("update", { noWait: true })
    )
    .then(
      () => false,
      () => true
    )

const operatorOfCustomer = async (id: string) =>
  (await pgDb.select().from(customers).where(eq(customers.id, id)))[0]!
    .operatorId
const operatorOfTask = async (id: number) =>
  (await pgDb.select().from(task).where(eq(task.id, id)))[0]!.operatorId

async function seedCustomer(operatorId: number) {
  const customer = await createCustomer({ operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state: "richiamare",
  })
  return { customer, contact }
}

type Seeded = Awaited<ReturnType<typeof seedCustomer>>

/**
 * The writers that move a customer or contact to `target`, other than
 * "Passaggio di consegne": each resolves to its error (the tag of the
 * service's, the code a procedure's carries), or to undefined when it
 * succeeds; then the error it gets for a target that is not working.
 */
const writers: [
  string,
  (args: {
    admin: { id: number; userId: string }
    target: { id: number }
    seeded: Seeded
  }) => Promise<string | undefined>,
  string,
][] = [
  [
    "un Assegna chiamate (task.bulkHandleTask)",
    ({ admin, target, seeded }) =>
      createTestCaller(admin)
        .task.bulkHandleTask({
          operatorId: target.id,
          customerIds: [seeded.customer.id],
        })
        .then(
          () => undefined,
          (error: unknown) => readContactError(error)?.code ?? String(error)
        ),
    "OPERATOR_NOT_FOUND",
  ],
  [
    "un Assegna Clienti (assignCustomers)",
    async ({ admin, target, seeded }) =>
      failureTag(
        await runServer(
          assignCustomers({
            customerIds: [seeded.customer.id],
            toOperatorId: target.id,
            actor: { role: "ADMIN", operatorId: admin.id },
          })
        )
      ),
    "OperatorNotFound",
  ],
  [
    "una riassegnazione del contatto (reassign)",
    async ({ admin, target, seeded }) =>
      failureTag(
        await runServer(
          reassign({
            taskId: seeded.contact.id,
            operatorId: target.id,
            actor: { role: "ADMIN", operatorId: admin.id },
          })
        )
      ),
    "OperatorNotFound",
  ],
]

describe.skipIf(!hasTestDatabase)(
  "findWorkingOperator e la disattivazione su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it("un passaggio di consegne verso X attende la disattivazione di X, senza il lock del cliente, poi riceve OperatorNotFound", async () => {
      const owner = await createOperator({ name: "Anna" })
      const target = await createOperator({ name: "Xavier" })
      const { customer, contact } = await seedCustomer(owner.id)

      const deactivating = deactivation(target.userId)
      await deactivating.locked

      const handingOver = runServer(
        handover({
          customerId: customer.id,
          toOperatorId: target.id,
          actor: { role: "OPERATORE", operatorId: owner.id },
        })
      )
      await waitUntilBlocked(1)

      // It waits on the user row, with the lock of findWorkingOperator, and
      // has not locked the customer yet: users first, then customers
      const [waiting] = await waitingQueries()
      expect(waiting).toMatch(/ for key share of "mito-deutsche_user"$/)
      expect(await isCustomerLocked(customer.id)).toBe(false)

      await deactivating.disable()
      const exit = await handingOver

      expect(failureTag(exit)).toBe("OperatorNotFound")
      expect(await operatorOfCustomer(customer.id)).toBe(owner.id)
      expect(await operatorOfTask(contact.id)).toBe(owner.id)
    })

    it("una disattivazione di X che parte durante un passaggio di consegne verso X attende che il passaggio finisca", async () => {
      const owner = await createOperator({ name: "Anna" })
      const target = await createOperator({ name: "Xavier" })
      const { customer, contact } = await seedCustomer(owner.id)

      // The handover locks X's user row, then waits on the customer
      const colleague = await holdCustomerLock(customer.id)
      const handingOver = runServer(
        handover({
          customerId: customer.id,
          toOperatorId: target.id,
          actor: { role: "OPERATORE", operatorId: owner.id },
        })
      )
      await waitUntilBlocked(1)

      // The deactivation waits on the handover's lock of the user row
      const deactivating = deactivation(target.userId)
      await waitUntilBlocked(2)

      await colleague.release()
      const exit = await handingOver
      await deactivating.locked
      await deactivating.disable()

      expect(failureTag(exit)).toBeUndefined()
      expect(await operatorOfCustomer(customer.id)).toBe(target.id)
      expect(await operatorOfTask(contact.id)).toBe(target.id)
    })

    it("un Assegna Clienti verso X già partito: X disattivato dopo il primo cliente ferma il secondo con OperatorNotFound", async () => {
      const admin = await createOperator({ role: "ADMIN" })
      const previous = await createOperator({ name: "Anna" })
      const target = await createOperator({ name: "Xavier" })
      const seeded = [
        await seedCustomer(previous.id),
        await seedCustomer(previous.id),
        await seedCustomer(previous.id),
      ]

      // Before the second customer's transaction begins, the deactivation
      // locks X's user row: that transaction then waits on it in
      // findWorkingOperator, and sees X disabled once the deactivation commits
      let deactivating: ReturnType<typeof deactivation> | undefined
      let transactions = 0
      const client = new Proxy(pgDb, {
        get(target_, property, receiver) {
          if (property !== "transaction") {
            return Reflect.get(target_, property, receiver) as unknown
          }
          return async (...args: Parameters<typeof pgDb.transaction>) => {
            transactions += 1
            if (transactions === 2) {
              deactivating = deactivation(target.userId)
              await deactivating.locked
            }
            return target_.transaction(...args)
          }
        },
      }) as unknown as DbClient

      const assigning = runServer(
        assignCustomers({
          customerIds: seeded.map(({ customer }) => customer.id),
          toOperatorId: target.id,
          actor: { role: "ADMIN", operatorId: admin.id },
        }).pipe(Effect.provideService(Db, client))
      )
      await waitUntilBlocked(1)
      expect(await waitingQueries()).toEqual([
        expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
      ])
      // Users first, then customers: the second customer is not locked yet
      expect(await isCustomerLocked(seeded[1]!.customer.id)).toBe(false)
      await deactivating!.disable()
      const exit = await assigning

      expect(failureTag(exit)).toBe("OperatorNotFound")
      expect(transactions).toBe(2)
      const [first, second, third] = seeded
      expect(await operatorOfCustomer(first!.customer.id)).toBe(target.id)
      expect(await operatorOfTask(first!.contact.id)).toBe(target.id)
      for (const untouched of [second!, third!]) {
        expect(await operatorOfCustomer(untouched.customer.id)).toBe(
          previous.id
        )
        expect(await operatorOfTask(untouched.contact.id)).toBe(previous.id)
      }
    })
    it.each(writers)(
      "%s verso X attende la disattivazione di X, senza il lock del cliente, poi riceve OperatorNotFound",
      async (_, write, notFound) => {
        const admin = await createOperator({ role: "ADMIN" })
        const owner = await createOperator({ name: "Anna" })
        const target = await createOperator({ name: "Xavier" })
        const seeded = await seedCustomer(owner.id)

        const deactivating = deactivation(target.userId)
        await deactivating.locked

        const writing = write({ admin, target, seeded })
        await waitUntilBlocked(1)

        // It waits on the user row, with the lock of findWorkingOperator, and
        // has not locked the customer yet: users first, then customers
        expect(await waitingQueries()).toEqual([
          expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
        ])
        expect(await isCustomerLocked(seeded.customer.id)).toBe(false)

        await deactivating.disable()

        expect(await writing).toBe(notFound)
        expect(await operatorOfCustomer(seeded.customer.id)).toBe(owner.id)
        expect(await operatorOfTask(seeded.contact.id)).toBe(owner.id)
        expect(
          await pgDb
            .select()
            .from(taskEventLog)
            .where(eq(taskEventLog.customerId, seeded.customer.id))
        ).toEqual([])
      }
    )
  }
)
