import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect, Exit } from "effect"
import { and, asc, count, eq, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { Db, type DbClient } from "../../../effect/db"
import { handover } from "../../customer/assignment"
import { deactivateOperator } from "../deactivate"
import { updateOperatorsRole } from "../roles"
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

// La disattivazione di un operatore contro le altre scritture, su un Postgres
// vero (PGlite ha una sola connessione): prima gli utenti, poi i clienti
// (gestione-operatori, AC7, AC11, AC12). Ogni sequenza è resa deterministica
// da un lock tenuto dal test e da `waitUntilBlocked`.

const deactivate = (
  operatorId: number,
  toOperatorId: number,
  admin: { id: number }
) =>
  runServer(
    deactivateOperator({
      operatorId,
      toOperatorId,
      actor: { role: "ADMIN", operatorId: admin.id },
    })
  )

/** The queries of the backends that wait for a lock. */
const waitingQueries = async () =>
  (
    await pgClient<{ query: string }[]>`
      SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
  ).map(({ query }) => query.trim())

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

  it("un passaggio di consegne dello stesso cliente partito prima finisce prima: la disattivazione non trova più niente da spostare", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    const colleague = await createOperator({ name: "Yuri" })
    const { customer, contact } = await seedCustomer(leaving.id)

    const held = await holdCustomerLock(customer.id)
    const handingOver = runServer(
      handover({
        customerId: customer.id,
        toOperatorId: colleague.id,
        actor: { role: "ADMIN", operatorId: admin.id },
      })
    )
    await waitUntilBlocked(1)
    // The deactivation locks the two users, then waits on the customer
    const deactivating = deactivate(leaving.id, target.id, admin)
    await waitUntilBlocked(2)
    expect(await waitingQueries()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^select "id" from "mito-deutsche_customers" .* for update$/
        ),
      ])
    )

    await held.release()
    const [handed, deactivated] = await Promise.all([handingOver, deactivating])

    expect(failureTag(handed)).toBeUndefined()
    expect(deactivated).toEqual(
      Exit.succeed({ customersMoved: 0, contactsMoved: 0, practicesMoved: 0 })
    )
    expect(await operatorOfCustomer(customer.id)).toBe(colleague.id)
    expect(await operatorOfTask(contact.id)).toBe(colleague.id)
    expect(await disabledAtOf(leaving.id)).not.toBeNull()
    expect((await logOf(customer.id)).map((row) => row.source)).toEqual([
      "detail",
      "detail",
    ])
  })

  it("un passaggio di consegne verso X che parte durante la disattivazione di X attende e riceve OperatorNotFound", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    const owner = await createOperator({ name: "Walter" })
    const ofLeaving = await seedCustomer(leaving.id)
    const ofOwner = await seedCustomer(owner.id)

    // The deactivation holds X's user row, waiting on X's customer
    const held = await holdCustomerLock(ofLeaving.customer.id)
    const deactivating = deactivate(leaving.id, target.id, admin)
    await waitUntilBlocked(1)
    const handingOver = runServer(
      handover({
        customerId: ofOwner.customer.id,
        toOperatorId: leaving.id,
        actor: { role: "OPERATORE", operatorId: owner.id },
      })
    )
    await waitUntilBlocked(2)
    expect(await waitingQueries()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ for key share of "mito-deutsche_user"$/),
      ])
    )

    await held.release()
    const [deactivated, handed] = await Promise.all([deactivating, handingOver])

    expect(deactivated).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(failureTag(handed)).toBe("OperatorNotFound")
    expect(await operatorOfCustomer(ofOwner.customer.id)).toBe(owner.id)
    expect(await operatorOfTask(ofOwner.contact.id)).toBe(owner.id)
    expect(await operatorOfCustomer(ofLeaving.customer.id)).toBe(target.id)
  })

  it("un passaggio di consegne verso X partito prima della disattivazione di X finisce, e la disattivazione sposta il suo cliente", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    const owner = await createOperator({ name: "Walter" })
    const { customer, contact } = await seedCustomer(owner.id)

    // The handover holds X's user row (KEY SHARE), waiting on the customer
    const held = await holdCustomerLock(customer.id)
    const handingOver = runServer(
      handover({
        customerId: customer.id,
        toOperatorId: leaving.id,
        actor: { role: "OPERATORE", operatorId: owner.id },
      })
    )
    await waitUntilBlocked(1)
    // The deactivation waits on X's user row
    const deactivating = deactivate(leaving.id, target.id, admin)
    await waitUntilBlocked(2)
    expect(await waitingQueries()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ for update of "mito-deutsche_user"$/),
      ])
    )

    await held.release()
    const [handed, deactivated] = await Promise.all([handingOver, deactivating])

    expect(failureTag(handed)).toBeUndefined()
    expect(deactivated).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(await operatorOfCustomer(customer.id)).toBe(target.id)
    expect(await operatorOfTask(contact.id)).toBe(target.id)
    expect(
      (await logOf(customer.id)).map((row) => [
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

  it("due disattivazioni simultanee dello stesso operatore: una sola riesce, l'altra riceve OperatorNotFound", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const first = await createOperator({ name: "Zoe" })
    const second = await createOperator({ name: "Zeno" })
    const { customer, contact } = await seedCustomer(leaving.id)

    const held = await holdCustomerLock(customer.id)
    const one = deactivate(leaving.id, first.id, admin)
    await waitUntilBlocked(1)
    const other = deactivate(leaving.id, second.id, admin)
    await waitUntilBlocked(2)
    // The second waits on X's user row, not on a customer
    const waiting = await waitingQueries()
    expect(
      waiting.filter((query) =>
        query.endsWith(' for update of "mito-deutsche_user"')
      )
    ).toHaveLength(1)

    await held.release()
    const [exitOne, exitOther] = await Promise.all([one, other])

    expect(exitOne).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(failureTag(exitOther)).toBe("OperatorNotFound")
    expect(await operatorOfCustomer(customer.id)).toBe(first.id)
    expect(await operatorOfTask(contact.id)).toBe(first.id)
    expect(await logOf(customer.id)).toHaveLength(2)
  })

  it("un cambio di ruolo dell'operatore durante la sua disattivazione attende e riceve OperatorNotFound: niente ADMIN disattivato", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    const { customer } = await seedCustomer(leaving.id)

    const held = await holdCustomerLock(customer.id)
    const deactivating = deactivate(leaving.id, target.id, admin)
    await waitUntilBlocked(1)
    const promoting = runServer(
      updateOperatorsRole([{ id: leaving.id, role: "ADMIN" }])
    )
    await waitUntilBlocked(2)

    await held.release()
    const [deactivated, promoted] = await Promise.all([deactivating, promoting])

    expect(failureTag(deactivated)).toBeUndefined()
    expect(failureTag(promoted)).toBe("OperatorNotFound")
    const [user] = await pgDb
      .select({ role: users.role, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, leaving.userId))
    expect(user).toMatchObject({ role: "OPERATORE" })
    expect(user!.disabledAt).not.toBeNull()
  })

  it("X→Y e Y→Z insieme, X→Y per prima: riescono tutte e due e il portafoglio di X finisce su Z", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const x = await createOperator({ name: "Xavier" })
    const y = await createOperator({ name: "Yuri" })
    const z = await createOperator({ name: "Zoe" })
    const ofX = await seedCustomer(x.id)
    const ofY = await seedCustomer(y.id)

    const held = await holdCustomerLock(ofX.customer.id)
    const xToY = deactivate(x.id, y.id, admin)
    await waitUntilBlocked(1)
    const yToZ = deactivate(y.id, z.id, admin)
    await waitUntilBlocked(2)

    await held.release()
    const [first, second] = await Promise.all([xToY, yToZ])

    expect(first).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(second).toEqual(
      Exit.succeed({ customersMoved: 2, contactsMoved: 2, practicesMoved: 0 })
    )
    for (const { customer, contact } of [ofX, ofY]) {
      expect(await operatorOfCustomer(customer.id)).toBe(z.id)
      expect(await operatorOfTask(contact.id)).toBe(z.id)
    }
    expect(await disabledAtOf(x.id)).not.toBeNull()
    expect(await disabledAtOf(y.id)).not.toBeNull()
  })

  it("X→Y e Y→Z insieme, Y→Z per prima: la seconda riceve OperatorNotFound e il portafoglio di X non cambia", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const x = await createOperator({ name: "Xavier" })
    const y = await createOperator({ name: "Yuri" })
    const z = await createOperator({ name: "Zoe" })
    const ofX = await seedCustomer(x.id)
    const ofY = await seedCustomer(y.id)

    const held = await holdCustomerLock(ofY.customer.id)
    const yToZ = deactivate(y.id, z.id, admin)
    await waitUntilBlocked(1)
    const xToY = deactivate(x.id, y.id, admin)
    await waitUntilBlocked(2)

    await held.release()
    const [first, second] = await Promise.all([yToZ, xToY])

    expect(first).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(failureTag(second)).toBe("OperatorNotFound")
    expect(await operatorOfCustomer(ofX.customer.id)).toBe(x.id)
    expect(await operatorOfTask(ofX.contact.id)).toBe(x.id)
    expect(await disabledAtOf(x.id)).toBeNull()
    expect(await operatorOfCustomer(ofY.customer.id)).toBe(z.id)
  })

  it("su un deadlock (40P01) la disattivazione si ripete e riesce", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    const { customer, contact } = await seedCustomer(leaving.id)

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
    const held = await holdCustomerLock(customer.id)
    await held.db.execute(sql`SET LOCAL deadlock_timeout = '10s'`)
    const deactivating = runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: { role: "ADMIN", operatorId: admin.id },
      }).pipe(Effect.provideService(Db, client))
    )
    await waitUntilBlocked(1)
    await held.db.execute(
      sql`SELECT id FROM "mito-deutsche_user" WHERE id = ${leaving.userId} FOR KEY SHARE`
    )
    await held.release()
    const exit = await deactivating

    expect(exit).toEqual(
      Exit.succeed({ customersMoved: 1, contactsMoved: 1, practicesMoved: 0 })
    )
    expect(transactions).toBe(2)
    expect(await operatorOfTask(contact.id)).toBe(target.id)
    expect(await logOf(customer.id)).toHaveLength(2)
  })

  it("regge 5.000 clienti e 5.000 contatti attivi (AC12)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ name: "Xavier" })
    const target = await createOperator({ name: "Zoe" })
    await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, name, surname, temp_id, unique_hash, source, operator_id)
        SELECT 'scale-' || g, 'Anna', 'scale-' || g, 'scale-' || g,
          'scale-' || g, 'inbound', ${leaving.id}
        FROM generate_series(1, 5000) AS g`
    await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active)
        SELECT 'scale-' || g, ${leaving.id}, 'chiamare', true
        FROM generate_series(1, 5000) AS g`

    const started = performance.now()
    const exit = await deactivate(leaving.id, target.id, admin)
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
    const [moved] = await pgDb
      .select({ n: count() })
      .from(customers)
      .where(eq(customers.operatorId, target.id))
    expect(moved!.n).toBe(5000)
    const [contacts] = await pgDb
      .select({ n: count() })
      .from(task)
      .where(and(eq(task.isActive, true), eq(task.operatorId, target.id)))
    expect(contacts!.n).toBe(5000)
    const [log] = await pgDb
      .select({ n: count() })
      .from(taskEventLog)
      .where(eq(taskEventLog.source, "deactivation"))
    expect(log!.n).toBe(10000)
    if (!process.env.CI) expect(elapsed).toBeLessThan(10_000)
  }, 60_000)
})
