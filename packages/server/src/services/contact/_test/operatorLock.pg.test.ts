import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { type ServerServices } from "@mito/server/effect/server"
import { eq } from "drizzle-orm"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { Db, type DbClient } from "../../../effect/db"
import { assignCustomers, handover } from "../../customer/assignment"
import { reassign } from "../reassign"
import { createTestCaller } from "@/test/caller"
import { failureTag, provideServer } from "@/test/effect"
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

/** Starts the program as the edges run it, in a fiber of the test. */
const forked = <A, E>(program: Effect.Effect<A, E, ServerServices>) =>
  program.pipe(provideServer, Effect.exit, Effect.forkChild)

const forkedAsIs = <A, E>(program: Effect.Effect<A, E>) =>
  Effect.forkChild(program)

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
  }) => Effect.Effect<string | undefined>,
  string,
][] = [
  [
    "un Assegna chiamate (task.bulkHandleTask)",
    ({ admin, target, seeded }) =>
      Effect.promise(() =>
        createTestCaller(admin)
          .task.bulkHandleTask({
            operatorId: target.id,
            customerIds: [seeded.customer.id],
          })
          .then(
            () => undefined,
            (error: unknown) => readContactError(error)?.code ?? String(error)
          )
      ),
    "OPERATOR_NOT_FOUND",
  ],
  [
    "un Assegna Clienti (assignCustomers)",
    ({ admin, target, seeded }) =>
      Effect.gen(function* () {
        const exit = yield* assignCustomers({
          customerIds: [seeded.customer.id],
          toOperatorId: target.id,
          actor: { role: "ADMIN", operatorId: admin.id },
        }).pipe(provideServer, Effect.exit)
        return failureTag(exit)
      }),
    "OperatorNotFound",
  ],
  [
    "una riassegnazione del contatto (reassign)",
    ({ admin, target, seeded }) =>
      Effect.gen(function* () {
        const exit = yield* reassign({
          taskId: seeded.contact.id,
          operatorId: target.id,
          actor: { role: "ADMIN", operatorId: admin.id },
        }).pipe(provideServer, Effect.exit)
        return failureTag(exit)
      }),
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

    it.effect(
      "un passaggio di consegne verso X attende la disattivazione di X, senza il lock del cliente, poi riceve OperatorNotFound",
      () =>
        Effect.gen(function* () {
          const owner = yield* Effect.promise(() =>
            createOperator({ name: "Anna" })
          )
          const target = yield* Effect.promise(() =>
            createOperator({ name: "Xavier" })
          )
          const { customer, contact } = yield* Effect.promise(() =>
            seedCustomer(owner.id)
          )

          const deactivating = deactivation(target.userId)
          yield* Effect.promise(() => deactivating.locked)

          const handingOver = yield* forked(
            handover({
              customerId: customer.id,
              toOperatorId: target.id,
              actor: { role: "OPERATORE", operatorId: owner.id },
            })
          )
          yield* Effect.promise(() => waitUntilBlocked(1))

          // It waits on the user row, with the lock of findWorkingOperator, and
          // has not locked the customer yet: users first, then customers
          const [waiting] = yield* Effect.promise(() => waitingQueries())
          expect(waiting).toMatch(/ for key share of "mito-deutsche_user"$/)
          expect(
            yield* Effect.promise(() => isCustomerLocked(customer.id))
          ).toBe(false)

          yield* Effect.promise(() => deactivating.disable())
          const exit = yield* Fiber.join(handingOver)

          expect(failureTag(exit)).toBe("OperatorNotFound")
          expect(
            yield* Effect.promise(() => operatorOfCustomer(customer.id))
          ).toBe(owner.id)
          expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
            owner.id
          )
        })
    )

    it.effect(
      "una disattivazione di X che parte durante un passaggio di consegne verso X attende che il passaggio finisca",
      () =>
        Effect.gen(function* () {
          const owner = yield* Effect.promise(() =>
            createOperator({ name: "Anna" })
          )
          const target = yield* Effect.promise(() =>
            createOperator({ name: "Xavier" })
          )
          const { customer, contact } = yield* Effect.promise(() =>
            seedCustomer(owner.id)
          )

          // The handover locks X's user row, then waits on the customer
          const colleague = yield* Effect.promise(() =>
            holdCustomerLock(customer.id)
          )
          const handingOver = yield* forked(
            handover({
              customerId: customer.id,
              toOperatorId: target.id,
              actor: { role: "OPERATORE", operatorId: owner.id },
            })
          )
          yield* Effect.promise(() => waitUntilBlocked(1))

          // The deactivation waits on the handover's lock of the user row
          const deactivating = deactivation(target.userId)
          yield* Effect.promise(() => waitUntilBlocked(2))

          yield* Effect.promise(() => colleague.release())
          const exit = yield* Fiber.join(handingOver)
          yield* Effect.promise(() => deactivating.locked)
          yield* Effect.promise(() => deactivating.disable())

          expect(failureTag(exit)).toBeUndefined()
          expect(
            yield* Effect.promise(() => operatorOfCustomer(customer.id))
          ).toBe(target.id)
          expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
            target.id
          )
        })
    )

    it.effect(
      "un Assegna Clienti verso X già partito: X disattivato dopo il primo cliente ferma il secondo con OperatorNotFound",
      () =>
        Effect.gen(function* () {
          const admin = yield* Effect.promise(() =>
            createOperator({ role: "ADMIN" })
          )
          const previous = yield* Effect.promise(() =>
            createOperator({ name: "Anna" })
          )
          const target = yield* Effect.promise(() =>
            createOperator({ name: "Xavier" })
          )
          const seeded = [
            yield* Effect.promise(() => seedCustomer(previous.id)),
            yield* Effect.promise(() => seedCustomer(previous.id)),
            yield* Effect.promise(() => seedCustomer(previous.id)),
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

          const assigning = yield* forked(
            assignCustomers({
              customerIds: seeded.map(({ customer }) => customer.id),
              toOperatorId: target.id,
              actor: { role: "ADMIN", operatorId: admin.id },
            }).pipe(Effect.provideService(Db, client))
          )
          yield* Effect.promise(() => waitUntilBlocked(1))
          expect(yield* Effect.promise(() => waitingQueries())).toEqual([
            expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
          ])
          // Users first, then customers: the second customer is not locked yet
          expect(
            yield* Effect.promise(() =>
              isCustomerLocked(seeded[1]!.customer.id)
            )
          ).toBe(false)
          yield* Effect.promise(() => deactivating!.disable())
          const exit = yield* Fiber.join(assigning)

          expect(failureTag(exit)).toBe("OperatorNotFound")
          expect(transactions).toBe(2)
          const [first, second, third] = seeded
          expect(
            yield* Effect.promise(() => operatorOfCustomer(first!.customer.id))
          ).toBe(target.id)
          expect(
            yield* Effect.promise(() => operatorOfTask(first!.contact.id))
          ).toBe(target.id)
          for (const untouched of [second!, third!]) {
            expect(
              yield* Effect.promise(() =>
                operatorOfCustomer(untouched.customer.id)
              )
            ).toBe(previous.id)
            expect(
              yield* Effect.promise(() => operatorOfTask(untouched.contact.id))
            ).toBe(previous.id)
          }
        })
    )
    it.effect.each(writers)(
      "%s verso X attende la disattivazione di X, senza il lock del cliente, poi riceve OperatorNotFound",
      ([_, write, notFound]) =>
        Effect.gen(function* () {
          const admin = yield* Effect.promise(() =>
            createOperator({ role: "ADMIN" })
          )
          const owner = yield* Effect.promise(() =>
            createOperator({ name: "Anna" })
          )
          const target = yield* Effect.promise(() =>
            createOperator({ name: "Xavier" })
          )
          const seeded = yield* Effect.promise(() => seedCustomer(owner.id))

          const deactivating = deactivation(target.userId)
          yield* Effect.promise(() => deactivating.locked)

          const writing = yield* forkedAsIs(write({ admin, target, seeded }))
          yield* Effect.promise(() => waitUntilBlocked(1))

          // It waits on the user row, with the lock of findWorkingOperator, and
          // has not locked the customer yet: users first, then customers
          expect(yield* Effect.promise(() => waitingQueries())).toEqual([
            expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
          ])
          expect(
            yield* Effect.promise(() => isCustomerLocked(seeded.customer.id))
          ).toBe(false)

          yield* Effect.promise(() => deactivating.disable())

          expect(yield* Fiber.join(writing)).toBe(notFound)
          expect(
            yield* Effect.promise(() => operatorOfCustomer(seeded.customer.id))
          ).toBe(owner.id)
          expect(
            yield* Effect.promise(() => operatorOfTask(seeded.contact.id))
          ).toBe(owner.id)
          expect(
            yield* Effect.promise(() =>
              pgDb
                .select()
                .from(taskEventLog)
                .where(eq(taskEventLog.customerId, seeded.customer.id))
            )
          ).toEqual([])
        })
    )
  }
)
