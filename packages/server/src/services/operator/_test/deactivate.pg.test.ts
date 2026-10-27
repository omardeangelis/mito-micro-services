import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { and, asc, count, eq, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { Db, type DbClient } from "../../../effect/db"
import {
  assignCustomers,
  assignToYourself,
  handover,
} from "../../customer/assignment"
import { deactivateOperator } from "../deactivate"
import { updateOperatorsRole } from "../roles"
import { createTestCaller } from "@/test/caller"
import { failureTag, runServer, provideServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import {
  activeTasksOf,
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// La disattivazione di un operatore contro le altre scritture, su un Postgres
// vero (PGlite ha una sola connessione): prima gli utenti, poi i clienti
// (gestione-operatori, AC7, AC11, AC12). Ogni sequenza è resa deterministica
// da un lock tenuto dal test e da `waitUntilBlocked`.

const deactivate = (
  operatorId: number,
  toOperatorId: number,
  admin: { id: number }
) =>
  deactivateOperator({
    operatorId,
    toOperatorId,
    actor: { role: "ADMIN", operatorId: admin.id },
  }).pipe(provideServer, Effect.exit)

/** The queries of the backends that wait for a lock. */
const waitingQueries = async () =>
  (
    await pgClient<{ query: string }[]>`
      SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
  ).map(({ query }) => query.trim())

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
const disabledAtOf = async (operatorId: number) =>
  (
    await pgDb
      .select({ disabledAt: users.disabledAt })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(eq(operators.id, operatorId))
  )[0]!.disabledAt
const logOf = (customerId: string) =>
  pgDb
    .select()
    .from(taskEventLog)
    .where(eq(taskEventLog.customerId, customerId))
    .orderBy(asc(taskEventLog.id))

async function seedCustomer(operatorId: number) {
  const customer = await createCustomer({ operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state: "richiamare",
  })
  return { customer, contact }
}

describe.skipIf(!hasTestDatabase)("deactivateOperator su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it.effect(
    "un passaggio di consegne dello stesso cliente partito prima finisce prima: la disattivazione non trova più niente da spostare",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const colleague = yield* Effect.promise(() =>
          createOperator({ name: "Yuri" })
        )
        const { customer, contact } = yield* Effect.promise(() =>
          seedCustomer(leaving.id)
        )

        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const handingOver = yield* Effect.forkChild(
          handover({
            customerId: customer.id,
            toOperatorId: colleague.id,
            actor: { role: "ADMIN", operatorId: admin.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        // The deactivation locks the two users, then waits on the customer
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^select "id" from "mito-deutsche_customers" .* for update$/
            ),
          ])
        )

        yield* Effect.promise(() => held.release())
        const [handed, deactivated] = yield* Effect.all([
          Fiber.join(handingOver),
          Fiber.join(deactivating),
        ])

        expect(failureTag(handed)).toBeUndefined()
        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 0,
            contactsMoved: 0,
            practicesMoved: 0,
          })
        )
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(colleague.id)
        expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
          colleague.id
        )
        expect(
          yield* Effect.promise(() => disabledAtOf(leaving.id))
        ).not.toBeNull()
        expect(
          (yield* Effect.promise(() => logOf(customer.id))).map(
            (row) => row.source
          )
        ).toEqual(["detail", "detail"])
      })
  )

  it.effect(
    "un passaggio di consegne verso X che parte durante la disattivazione di X attende e riceve OperatorNotFound",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const owner = yield* Effect.promise(() =>
          createOperator({ name: "Walter" })
        )
        const ofLeaving = yield* Effect.promise(() => seedCustomer(leaving.id))
        const ofOwner = yield* Effect.promise(() => seedCustomer(owner.id))

        // The deactivation holds X's user row, waiting on X's customer
        const held = yield* Effect.promise(() =>
          holdCustomerLock(ofLeaving.customer.id)
        )
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        const handingOver = yield* Effect.forkChild(
          handover({
            customerId: ofOwner.customer.id,
            toOperatorId: leaving.id,
            actor: { role: "OPERATORE", operatorId: owner.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
          ])
        )

        yield* Effect.promise(() => held.release())
        const [deactivated, handed] = yield* Effect.all([
          Fiber.join(deactivating),
          Fiber.join(handingOver),
        ])

        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(failureTag(handed)).toBe("OperatorNotFound")
        expect(
          yield* Effect.promise(() => operatorOfCustomer(ofOwner.customer.id))
        ).toBe(owner.id)
        expect(
          yield* Effect.promise(() => operatorOfTask(ofOwner.contact.id))
        ).toBe(owner.id)
        expect(
          yield* Effect.promise(() => operatorOfCustomer(ofLeaving.customer.id))
        ).toBe(target.id)
      })
  )

  it.effect(
    "un passaggio di consegne verso X partito prima della disattivazione di X finisce, e la disattivazione sposta il suo cliente",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const owner = yield* Effect.promise(() =>
          createOperator({ name: "Walter" })
        )
        const { customer, contact } = yield* Effect.promise(() =>
          seedCustomer(owner.id)
        )

        // The handover holds X's user row (KEY SHARE), waiting on the customer
        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const handingOver = yield* Effect.forkChild(
          handover({
            customerId: customer.id,
            toOperatorId: leaving.id,
            actor: { role: "OPERATORE", operatorId: owner.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        // The deactivation waits on X's user row
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/ for update of "mito-deutsche_user"$/),
          ])
        )

        yield* Effect.promise(() => held.release())
        const [handed, deactivated] = yield* Effect.all([
          Fiber.join(handingOver),
          Fiber.join(deactivating),
        ])

        expect(failureTag(handed)).toBeUndefined()
        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(target.id)
        expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
          target.id
        )
        expect(
          (yield* Effect.promise(() => logOf(customer.id))).map((row) => [
            row.source,
            row.fromOperatorId,
            row.toOperatorId,
          ])
        ).toEqual([
          ["detail", owner.id, leaving.id],
          ["detail", owner.id, leaving.id],
          ["deactivation", leaving.id, target.id],
          ["deactivation", leaving.id, target.id],
        ])
      })
  )

  it.effect(
    "un cliente e un contatto attivo di X scritti e confermati da un'altra connessione dopo i lock: si spostano e hanno la loro riga di log, e su X non resta niente (AC9)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const { customer, contact } = yield* Effect.promise(() =>
          seedCustomer(leaving.id)
        )

        // A writer outside the lock rule holds X's contact: the deactivation locks
        // the users and the customer, then waits on the contact. Before freeing
        // it, the writer adds a customer of X with an active contact of X and
        // commits: the deactivation locked neither, and its next statement, the
        // move, is the first to see them. The writer commits before every write
        // of the deactivation, so this test passes with the log and the moves in
        // separate statements too: what guards "one statement" is the test on the
        // shape of the SQL in deactivate.db.test.ts
        let release!: () => void
        let onLocked!: () => void
        const gate = new Promise<void>((resolve) => (release = resolve))
        const locked = new Promise<void>((resolve) => (onLocked = resolve))
        const writer = pgClient.begin(async (tx) => {
          await tx`SELECT id FROM "mito-deutsche_task" WHERE id = ${contact.id} FOR UPDATE`
          onLocked()
          await gate
          await tx`
        INSERT INTO "mito-deutsche_customers"
          (id, name, surname, temp_id, unique_hash, source, operator_id)
        VALUES ('late', 'Anna', 'late', 'late', 'late', 'inbound', ${leaving.id})`
          return tx<{ id: number }[]>`
        INSERT INTO "mito-deutsche_task" (customer_id, operator_id, state, is_active)
        VALUES ('late', ${leaving.id}, 'chiamare', true)
        RETURNING id`
        })
        yield* Effect.promise(() => locked)

        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual([
          expect.stringMatching(
            /^select "id" from "mito-deutsche_task" .* for update$/
          ),
        ])
        release()
        const [late] = yield* Effect.promise(() => writer)
        const exit = yield* Fiber.join(deactivating)

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 2,
            contactsMoved: 2,
            practicesMoved: 0,
          })
        )
        // What moved is what was logged: one row per customer and per contact
        const logged = yield* Effect.promise(() =>
          pgDb
            .select()
            .from(taskEventLog)
            .where(eq(taskEventLog.source, "deactivation"))
            .orderBy(asc(taskEventLog.id))
        )
        expect(logged).toHaveLength(2 + 2)
        expect(
          logged.map((row) => [
            row.customerId,
            row.taskId,
            row.fromOperatorId,
            row.toOperatorId,
          ])
        ).toEqual(
          expect.arrayContaining([
            [customer.id, null, leaving.id, target.id],
            [customer.id, contact.id, leaving.id, target.id],
            ["late", null, leaving.id, target.id],
            ["late", late!.id, leaving.id, target.id],
          ])
        )
        expect(yield* Effect.promise(() => operatorOfCustomer("late"))).toBe(
          target.id
        )
        expect(yield* Effect.promise(() => operatorOfTask(late!.id))).toBe(
          target.id
        )
        // Nothing is left on X
        const [onCustomers] = yield* Effect.promise(() =>
          pgDb
            .select({ n: count() })
            .from(customers)
            .where(eq(customers.operatorId, leaving.id))
        )
        const [onContacts] = yield* Effect.promise(() =>
          pgDb
            .select({ n: count() })
            .from(task)
            .where(
              and(eq(task.isActive, true), eq(task.operatorId, leaving.id))
            )
        )
        expect([onCustomers!.n, onContacts!.n]).toEqual([0, 0])
      })
  )

  it.effect(
    "Assegna a te di X partito prima della disattivazione di X finisce, e la disattivazione sposta il cliente preso (AC7)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: null })
        )
        const contact = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: null,
            state: "chiamare",
          })
        )

        // The self-assign holds X's user row (KEY SHARE), waiting on the customer
        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const taking = yield* Effect.forkChild(
          assignToYourself({
            customerId: customer.id,
            actor: { role: "OPERATORE", operatorId: leaving.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        // The deactivation waits on X's user row
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/ for update of "mito-deutsche_user"$/),
          ])
        )

        yield* Effect.promise(() => held.release())
        const [taken, deactivated] = yield* Effect.all([
          Fiber.join(taking),
          Fiber.join(deactivating),
        ])

        expect(failureTag(taken)).toBeUndefined()
        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(target.id)
        expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
          target.id
        )
        expect(
          (yield* Effect.promise(() => logOf(customer.id))).map((row) => [
            row.source,
            row.fromOperatorId,
            row.toOperatorId,
          ])
        ).toEqual([
          ["self_assign", null, leaving.id],
          ["self_assign", null, leaving.id],
          ["deactivation", leaving.id, target.id],
          ["deactivation", leaving.id, target.id],
        ])
      })
  )

  it.effect(
    "Assegna a te di X partito durante la disattivazione di X attende e riceve OperatorNotFound: il cliente resta senza operatore (AC7)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const ofLeaving = yield* Effect.promise(() => seedCustomer(leaving.id))
        const free = yield* Effect.promise(() =>
          createCustomer({ operatorId: null })
        )
        const freeContact = yield* Effect.promise(() =>
          createTask({
            customerId: free.id,
            operatorId: null,
            state: "chiamare",
          })
        )

        // The deactivation holds X's user row, waiting on X's customer
        const held = yield* Effect.promise(() =>
          holdCustomerLock(ofLeaving.customer.id)
        )
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        const taking = yield* Effect.forkChild(
          assignToYourself({
            customerId: free.id,
            actor: { role: "OPERATORE", operatorId: leaving.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
          ])
        )
        expect(yield* Effect.promise(() => isCustomerLocked(free.id))).toBe(
          false
        )

        yield* Effect.promise(() => held.release())
        const [deactivated, taken] = yield* Effect.all([
          Fiber.join(deactivating),
          Fiber.join(taking),
        ])

        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(failureTag(taken)).toBe("OperatorNotFound")
        expect(
          yield* Effect.promise(() => operatorOfCustomer(free.id))
        ).toBeNull()
        expect(
          yield* Effect.promise(() => operatorOfTask(freeContact.id))
        ).toBeNull()
        expect(yield* Effect.promise(() => logOf(free.id))).toEqual([])
      })
  )

  it.effect.each([
    [
      "un Assegna chiamate (task.bulkHandleTask)",
      (admin: { userId: string }, customerId: string, toOperatorId: number) =>
        createTestCaller(admin)
          .task.bulkHandleTask({
            operatorId: toOperatorId,
            customerIds: [customerId],
          })
          .then(
            () => undefined,
            (error: unknown) => error
          ),
    ],
    [
      "un Assegna Clienti (assignCustomers)",
      async (admin: { id: number }, customerId: string, toOperatorId: number) =>
        failureTag(
          await runServer(
            assignCustomers({
              customerIds: [customerId],
              toOperatorId,
              actor: { role: "ADMIN", operatorId: admin.id },
            })
          )
        ),
    ],
  ])(
    "%s verso X che tiene già il KEY SHARE quando parte la disattivazione di X finisce per primo, e la disattivazione sposta il suo cliente",
    (testCase) =>
      Effect.gen(function* () {
        const write = testCase[1] as (
          admin: { id: number; userId: string },
          customerId: string,
          toOperatorId: number
        ) => Promise<unknown>
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const owner = yield* Effect.promise(() =>
          createOperator({ name: "Walter" })
        )
        const { customer } = yield* Effect.promise(() => seedCustomer(owner.id))

        // The writer holds X's user row (KEY SHARE), waiting on the customer
        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const writing = yield* Effect.forkChild(
          Effect.promise(() => write(admin, customer.id, leaving.id))
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        // The deactivation waits on X's user row
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        expect(yield* Effect.promise(() => waitingQueries())).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/ for update of "mito-deutsche_user"$/),
            expect.stringMatching(
              /^select "id", "operator_id" from "mito-deutsche_customers" .* for update$/
            ),
          ])
        )

        yield* Effect.promise(() => held.release())
        const [written, deactivated] = yield* Effect.all([
          Fiber.join(writing),
          Fiber.join(deactivating),
        ])

        expect(written).toBeUndefined()
        expect(deactivated).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(target.id)
        expect(
          (yield* Effect.promise(() => activeTasksOf(customer.id))).map(
            (row) => row.operatorId
          )
        ).toEqual([target.id])
        expect(
          (yield* Effect.promise(() => logOf(customer.id)))
            .filter((row) => row.source === "deactivation")
            .map((row) => [row.fromOperatorId, row.toOperatorId])
        ).toEqual([
          [leaving.id, target.id],
          [leaving.id, target.id],
        ])
      })
  )

  it.effect(
    "due disattivazioni simultanee dello stesso operatore: una sola riesce, l'altra riceve OperatorNotFound",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const first = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const second = yield* Effect.promise(() =>
          createOperator({ name: "Zeno" })
        )
        const { customer, contact } = yield* Effect.promise(() =>
          seedCustomer(leaving.id)
        )

        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const one = yield* Effect.forkChild(
          deactivate(leaving.id, first.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        const other = yield* Effect.forkChild(
          deactivate(leaving.id, second.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(2))
        // The second waits on X's user row, not on a customer
        const waiting = yield* Effect.promise(() => waitingQueries())
        expect(
          waiting.filter((query) =>
            query.endsWith(' for update of "mito-deutsche_user"')
          )
        ).toHaveLength(1)

        yield* Effect.promise(() => held.release())
        const [exitOne, exitOther] = yield* Effect.all([
          Fiber.join(one),
          Fiber.join(other),
        ])

        expect(exitOne).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(failureTag(exitOther)).toBe("OperatorNotFound")
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(first.id)
        expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
          first.id
        )
        expect(yield* Effect.promise(() => logOf(customer.id))).toHaveLength(2)
      })
  )

  it.effect(
    "un cambio di ruolo dell'operatore durante la sua disattivazione attende e riceve OperatorNotFound: niente ADMIN disattivato",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        const { customer } = yield* Effect.promise(() =>
          seedCustomer(leaving.id)
        )

        const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
        const deactivating = yield* Effect.forkChild(
          deactivate(leaving.id, target.id, admin)
        )
        yield* Effect.promise(() => waitUntilBlocked(1))
        const promoting = yield* Effect.forkChild(
          updateOperatorsRole([{ id: leaving.id, role: "ADMIN" }]).pipe(
            provideServer,
            Effect.exit
          )
        )
        yield* Effect.promise(() => waitUntilBlocked(2))

        yield* Effect.promise(() => held.release())
        const [deactivated, promoted] = yield* Effect.all([
          Fiber.join(deactivating),
          Fiber.join(promoting),
        ])

        expect(failureTag(deactivated)).toBeUndefined()
        expect(failureTag(promoted)).toBe("OperatorNotFound")
        const [user] = yield* Effect.promise(() =>
          pgDb
            .select({ role: users.role, disabledAt: users.disabledAt })
            .from(users)
            .where(eq(users.id, leaving.userId))
        )
        expect(user).toMatchObject({ role: "OPERATORE" })
        expect(user!.disabledAt).not.toBeNull()
      })
  )

  it.effect(
    "X→Y e Y→Z insieme, X→Y per prima: riescono tutte e due e il portafoglio di X finisce su Z",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const x = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const y = yield* Effect.promise(() => createOperator({ name: "Yuri" }))
        const z = yield* Effect.promise(() => createOperator({ name: "Zoe" }))
        const ofX = yield* Effect.promise(() => seedCustomer(x.id))
        const ofY = yield* Effect.promise(() => seedCustomer(y.id))

        const held = yield* Effect.promise(() =>
          holdCustomerLock(ofX.customer.id)
        )
        const xToY = yield* Effect.forkChild(deactivate(x.id, y.id, admin))
        yield* Effect.promise(() => waitUntilBlocked(1))
        const yToZ = yield* Effect.forkChild(deactivate(y.id, z.id, admin))
        yield* Effect.promise(() => waitUntilBlocked(2))

        yield* Effect.promise(() => held.release())
        const [first, second] = yield* Effect.all([
          Fiber.join(xToY),
          Fiber.join(yToZ),
        ])

        expect(first).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(second).toEqual(
          Exit.succeed({
            customersMoved: 2,
            contactsMoved: 2,
            practicesMoved: 0,
          })
        )
        for (const { customer, contact } of [ofX, ofY]) {
          expect(
            yield* Effect.promise(() => operatorOfCustomer(customer.id))
          ).toBe(z.id)
          expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
            z.id
          )
        }
        expect(yield* Effect.promise(() => disabledAtOf(x.id))).not.toBeNull()
        expect(yield* Effect.promise(() => disabledAtOf(y.id))).not.toBeNull()
      })
  )

  it.effect(
    "X→Y e Y→Z insieme, Y→Z per prima: la seconda riceve OperatorNotFound e il portafoglio di X non cambia",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const x = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const y = yield* Effect.promise(() => createOperator({ name: "Yuri" }))
        const z = yield* Effect.promise(() => createOperator({ name: "Zoe" }))
        const ofX = yield* Effect.promise(() => seedCustomer(x.id))
        const ofY = yield* Effect.promise(() => seedCustomer(y.id))

        const held = yield* Effect.promise(() =>
          holdCustomerLock(ofY.customer.id)
        )
        const yToZ = yield* Effect.forkChild(deactivate(y.id, z.id, admin))
        yield* Effect.promise(() => waitUntilBlocked(1))
        const xToY = yield* Effect.forkChild(deactivate(x.id, y.id, admin))
        yield* Effect.promise(() => waitUntilBlocked(2))

        yield* Effect.promise(() => held.release())
        const [first, second] = yield* Effect.all([
          Fiber.join(yToZ),
          Fiber.join(xToY),
        ])

        expect(first).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(failureTag(second)).toBe("OperatorNotFound")
        expect(
          yield* Effect.promise(() => operatorOfCustomer(ofX.customer.id))
        ).toBe(x.id)
        expect(
          yield* Effect.promise(() => operatorOfTask(ofX.contact.id))
        ).toBe(x.id)
        expect(yield* Effect.promise(() => disabledAtOf(x.id))).toBeNull()
        expect(
          yield* Effect.promise(() => operatorOfCustomer(ofY.customer.id))
        ).toBe(z.id)
      })
  )

  it.effect("su un deadlock (40P01) la disattivazione si ripete e riesce", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const leaving = yield* Effect.promise(() =>
        createOperator({ name: "Xavier" })
      )
      const target = yield* Effect.promise(() =>
        createOperator({ name: "Zoe" })
      )
      const { customer, contact } = yield* Effect.promise(() =>
        seedCustomer(leaving.id)
      )

      // Counts the transactions the deactivation opens: only a 40P01 opens a
      // second one
      let transactions = 0
      const client = new Proxy(pgDb, {
        get(target_, property, receiver) {
          if (property !== "transaction") {
            return Reflect.get(target_, property, receiver) as unknown
          }
          return async (...args: Parameters<typeof pgDb.transaction>) => {
            transactions += 1
            return target_.transaction(...args)
          }
        },
      }) as unknown as DbClient

      // A writer outside the rule: it holds the customer, then asks for X's
      // user row, which the deactivation waiting on the customer holds. With
      // its detector set later, the deactivation is the one that aborts
      const held = yield* Effect.promise(() => holdCustomerLock(customer.id))
      yield* Effect.promise(() =>
        held.db.execute(sql`SET LOCAL deadlock_timeout = '10s'`)
      )
      const deactivating = yield* Effect.forkChild(
        deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: { role: "ADMIN", operatorId: admin.id },
        }).pipe(Effect.provideService(Db, client), provideServer, Effect.exit)
      )
      yield* Effect.promise(() => waitUntilBlocked(1))
      yield* Effect.promise(() =>
        held.db.execute(
          sql`SELECT id FROM "mito-deutsche_user" WHERE id = ${leaving.userId} FOR KEY SHARE`
        )
      )
      yield* Effect.promise(() => held.release())
      const exit = yield* Fiber.join(deactivating)

      expect(exit).toEqual(
        Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
      )
      expect(transactions).toBe(2)
      expect(yield* Effect.promise(() => operatorOfTask(contact.id))).toBe(
        target.id
      )
      expect(yield* Effect.promise(() => logOf(customer.id))).toHaveLength(2)
    })
  )

  it.effect(
    "regge 5.000 clienti e 5.000 contatti attivi (AC12)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() =>
          createOperator({ name: "Xavier" })
        )
        const target = yield* Effect.promise(() =>
          createOperator({ name: "Zoe" })
        )
        yield* Effect.promise(
          () => pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, name, surname, temp_id, unique_hash, source, operator_id)
        SELECT 'scale-' || g, 'Anna', 'scale-' || g, 'scale-' || g,
          'scale-' || g, 'inbound', ${leaving.id}
        FROM generate_series(1, 5000) AS g`
        )
        yield* Effect.promise(
          () => pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active)
        SELECT 'scale-' || g, ${leaving.id}, 'chiamare', true
        FROM generate_series(1, 5000) AS g`
        )

        const started = performance.now()
        const exit = yield* deactivate(leaving.id, target.id, admin)
        const elapsed = performance.now() - started
        console.log(
          `deactivateOperator, 5.000 clienti e 5.000 contatti: ${Math.round(elapsed)} ms`
        )

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 5000,
            contactsMoved: 5000,
            practicesMoved: 0,
          })
        )
        const [moved] = yield* Effect.promise(() =>
          pgDb
            .select({ n: count() })
            .from(customers)
            .where(eq(customers.operatorId, target.id))
        )
        expect(moved!.n).toBe(5000)
        const [contacts] = yield* Effect.promise(() =>
          pgDb
            .select({ n: count() })
            .from(task)
            .where(and(eq(task.isActive, true), eq(task.operatorId, target.id)))
        )
        expect(contacts!.n).toBe(5000)
        const [log] = yield* Effect.promise(() =>
          pgDb
            .select({ n: count() })
            .from(taskEventLog)
            .where(eq(taskEventLog.source, "deactivation"))
        )
        expect(log!.n).toBe(10000)
        if (!process.env.CI) expect(elapsed).toBeLessThan(10_000)
      }),
    60_000
  )
})
