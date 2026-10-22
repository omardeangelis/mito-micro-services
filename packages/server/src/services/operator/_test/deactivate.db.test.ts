import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { actorOf } from "../../contact/actor"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { customers } from "@mito/db/schema/customers"
import { eq } from "drizzle-orm"
import { deactivateOperator } from "../deactivate"
import { vi } from "vitest"
import { asc, inArray } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { operators } from "@mito/db/schema/operators"
import { practices } from "@mito/db/schema/pratiche"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { accounts, sessions, users } from "@mito/db/schema/users"
import { testClient } from "@/test/db"
import { failureTag } from "@/test/effect"
import { failNextInsertInto } from "@/test/failpoint"
import {
  createAlert,
  createPractice,
  createSystemOperator,
} from "@/test/factories"
import { deactivationImpact } from "../deactivate"

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

// ---------------------------------------------------------------------------
// Rifiuti (AC3–AC6): niente cambia

const userOf = async (operatorId: number) => {
  const [row] = await testDb
    .select({ user: users })
    .from(operators)
    .innerJoin(users, eq(operators.userId, users.id))
    .where(eq(operators.id, operatorId))
  return row!.user
}

const addSession = async (userId: string) => {
  const sessionToken = `session-${userId}-${Math.random()}`
  await testDb.insert(sessions).values({
    sessionToken,
    userId,
    expires: new Date("2099-01-01T00:00:00.000Z"),
  })
  return sessionToken
}

const sessionsOf = (userId: string) =>
  testDb.select().from(sessions).where(eq(sessions.userId, userId))

/** Customers, tasks, practices, log, users and sessions, as they are now. */
const snapshot = async () => ({
  customers: await testDb.select().from(customers).orderBy(asc(customers.id)),
  tasks: await testDb.select().from(task).orderBy(asc(task.id)),
  practices: await testDb
    .select()
    .from(practices)
    .orderBy(asc(practices.praticaId)),
  log: await testDb.select().from(taskEventLog).orderBy(asc(taskEventLog.id)),
  users: await testDb.select().from(users).orderBy(asc(users.id)),
  sessions: await testDb
    .select()
    .from(sessions)
    .orderBy(asc(sessions.sessionToken)),
})

/** An operator with a customer, an active contact, a practice and a session. */
const seedPortfolio = async (
  values: Parameters<typeof createOperator>[0] = {}
) => {
  const operator = await createOperator(values)
  const customer = await createCustomer({ operatorId: operator.id })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: operator.id,
  })
  await createPractice({ customerId: customer.id, operatorId: operator.id })
  await addSession(operator.userId)
  return { operator, customer, contact }
}

describe("deactivateOperator: i rifiuti non cambiano nulla", () => {
  it("un utente ADMIN è rifiutato con OperatorIsAdmin (AC3)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const { operator: other } = await seedPortfolio({ role: "ADMIN" })
    const target = await createOperator()
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: other.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("OperatorIsAdmin")
    expect(await snapshot()).toEqual(before)
  })

  it("disattivare sé stessi è rifiutato con CannotDeactivateSelf, prima del controllo sugli admin (AC4)", async () => {
    const { operator: admin } = await seedPortfolio({ role: "ADMIN" })
    const target = await createOperator()
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: admin.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("CannotDeactivateSelf")
    expect(await snapshot()).toEqual(before)
  })

  it("un operatorId inesistente è OperatorNotFound (AC5)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()
    await seedPortfolio()
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: 999_999,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("OperatorNotFound")
    expect(await snapshot()).toEqual(before)
  })

  it("l'operatore di sistema, senza utente, è OperatorNotFound (AC5)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()
    const system = await createSystemOperator()
    const customer = await createCustomer({ operatorId: system.id })
    await createTask({ customerId: customer.id, operatorId: system.id })
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: system.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("OperatorNotFound")
    expect(await snapshot()).toEqual(before)
  })

  it("un operatore già disattivato è OperatorNotFound (AC5)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()
    await seedPortfolio({
      disabledAt: new Date("2026-10-01T08:00:00.000Z"),
      disabledBy: admin.id,
    })
    const [disabled] = await testDb
      .select()
      .from(operators)
      .orderBy(asc(operators.id))
      .offset(2)
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: disabled!.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("OperatorNotFound")
    expect(await snapshot()).toEqual(before)
  })

  it("una destinazione inesistente, disattivata o di sistema è OperatorNotFound (AC6)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const { operator: leaving } = await seedPortfolio()
    const disabled = await createOperator({
      disabledAt: new Date("2026-10-01T08:00:00.000Z"),
    })
    const system = await createSystemOperator()
    const before = await snapshot()

    for (const toOperatorId of [999_999, disabled.id, system.id]) {
      const exit = await runServer(
        deactivateOperator({
          operatorId: leaving.id,
          toOperatorId,
          actor: actorOf(admin),
        })
      )
      expect(failureTag(exit)).toBe("OperatorNotFound")
    }
    expect(await snapshot()).toEqual(before)
  })

  it("una destinazione uguale all'operatore disattivato è HandoverSameOperator (AC6)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const { operator: leaving } = await seedPortfolio()
    const before = await snapshot()

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: leaving.id,
        actor: actorOf(admin),
      })
    )

    expect(failureTag(exit)).toBe("HandoverSameOperator")
    expect(await snapshot()).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// La disattivazione riuscita (AC8, AC9, AC10, AC13)

describe("deactivateOperator: cosa sposta e cosa no", () => {
  const seedAll = async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    const colleague = await createOperator()

    // A: of X, with an active contact (in richiamare, with an alert) and an
    // inactive one, a resolved alert and an earlier log row
    const ofLeaving = await createCustomer({ operatorId: leaving.id })
    const inactive = await createTask({
      customerId: ofLeaving.id,
      operatorId: leaving.id,
      state: "app.to",
      isActive: false,
    })
    const resolved = await createAlert({
      taskId: inactive.id,
      deadline: new Date("2026-09-01T08:00:00.000Z"),
      isResolved: true,
      resolvedBy: leaving.id,
    })
    const active = await createTask({
      customerId: ofLeaving.id,
      operatorId: leaving.id,
      state: "richiamare",
      priority: 77,
      customPriority: true,
    })
    const callback = await createAlert({
      taskId: active.id,
      deadline: new Date("2026-11-01T08:00:00.000Z"),
      message: "Richiamare",
    })
    await testDb.insert(taskEventLog).values({
      customerId: ofLeaving.id,
      taskId: inactive.id,
      actorOperatorId: leaving.id,
      action: "state_change",
      source: "detail",
      fromState: "chiamare",
      toState: "app.to",
    })
    // B: of X, without contacts
    const bare = await createCustomer({ operatorId: leaving.id })
    // N: without operator, with an active contact of X
    const orphan = await createCustomer({ operatorId: null })
    const orphanContact = await createTask({
      customerId: orphan.id,
      operatorId: leaving.id,
    })
    // Y: of a colleague, with an active contact of X
    const ofColleague = await createCustomer({ operatorId: colleague.id })
    const colleagueContact = await createTask({
      customerId: ofColleague.id,
      operatorId: leaving.id,
    })
    // Untouched: a customer of the colleague and their contact
    const untouched = await createCustomer({ operatorId: colleague.id })
    const untouchedContact = await createTask({
      customerId: untouched.id,
      operatorId: colleague.id,
    })

    const practice = await createPractice({
      customerId: ofLeaving.id,
      operatorId: leaving.id,
    })
    const otherPractice = await createPractice({
      customerId: untouched.id,
      operatorId: colleague.id,
    })

    // The chat of A with X on it, X's account and sessions
    const [savedChat] = await testDb.insert(chat).values({}).returning()
    await testDb
      .update(customers)
      .set({ chatId: savedChat!.id })
      .where(eq(customers.id, ofLeaving.id))
    await testDb
      .insert(chatToOperator)
      .values({ chatId: savedChat!.id, operatorId: leaving.id })
    await testDb.insert(accounts).values({
      userId: leaving.userId,
      type: "oauth",
      provider: "google",
      providerAccountId: `google-${leaving.userId}`,
    })
    await addSession(leaving.userId)
    await addSession(leaving.userId)
    const otherSession = await addSession(colleague.userId)

    return {
      admin,
      leaving,
      target,
      colleague,
      ofLeaving,
      inactive,
      resolved,
      active,
      callback,
      bare,
      orphan,
      orphanContact,
      ofColleague,
      colleagueContact,
      untouched,
      untouchedContact,
      practice,
      otherPractice,
      otherSession,
    }
  }

  const run = (seed: Awaited<ReturnType<typeof seedAll>>) =>
    runServer(
      deactivateOperator({
        operatorId: seed.leaving.id,
        toOperatorId: seed.target.id,
        actor: actorOf(seed.admin),
      })
    )

  it("risponde con i conteggi: due clienti, tre contatti attivi, una pratica (AC13)", async () => {
    const seed = await seedAll()

    const exit = await run(seed)

    expect(exit).toEqual(
      Exit.succeed({ customersMoved: 2, contactsMoved: 3, practicesMoved: 1 })
    )
  })

  it("disattiva l'utente con l'admin in disabled_by e ne cancella le sessioni (AC8a, AC8e)", async () => {
    const seed = await seedAll()
    const before = Date.now()

    await run(seed)

    const user = await userOf(seed.leaving.id)
    expect(user.disabledBy).toBe(seed.admin.id)
    expect(user.disabledAt).toBeInstanceOf(Date)
    expect(user.disabledAt!.getTime()).toBeGreaterThan(before - 60_000)
    expect(await sessionsOf(seed.leaving.userId)).toEqual([])
    expect(await sessionsOf(seed.colleague.userId)).toMatchObject([
      { sessionToken: seed.otherSession },
    ])
    expect((await userOf(seed.target.id)).disabledAt).toBeNull()
  })

  it("i clienti dell'operatore e le sue pratiche passano alla destinazione; gli altri clienti no (AC8b, AC8d)", async () => {
    const seed = await seedAll()

    await run(seed)

    expect(await operatorOfCustomer(seed.ofLeaving.id)).toBe(seed.target.id)
    expect(await operatorOfCustomer(seed.bare.id)).toBe(seed.target.id)
    expect(await operatorOfCustomer(seed.orphan.id)).toBeNull()
    expect(await operatorOfCustomer(seed.ofColleague.id)).toBe(
      seed.colleague.id
    )
    expect(await operatorOfCustomer(seed.untouched.id)).toBe(seed.colleague.id)
    const rows = await testDb
      .select({ id: practices.praticaId, operatorId: practices.operatorId })
      .from(practices)
      .orderBy(asc(practices.praticaId))
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: seed.practice.praticaId, operatorId: seed.target.id },
        { id: seed.otherPractice.praticaId, operatorId: seed.colleague.id },
      ])
    )
  })

  it("ogni contatto attivo passa all'operatore del suo cliente dopo lo spostamento, o alla destinazione se il cliente non ne ha (AC8c)", async () => {
    const seed = await seedAll()

    await run(seed)

    const operatorOfTask = async (id: number) =>
      (await testDb.select().from(task).where(eq(task.id, id)))[0]!.operatorId
    expect(await operatorOfTask(seed.active.id)).toBe(seed.target.id)
    expect(await operatorOfTask(seed.orphanContact.id)).toBe(seed.target.id)
    expect(await operatorOfTask(seed.colleagueContact.id)).toBe(
      seed.colleague.id
    )
    expect(await operatorOfTask(seed.untouchedContact.id)).toBe(
      seed.colleague.id
    )
  })

  it("scrive una riga operator_reassign per cliente e per contatto attivo spostati, e nessuna per le pratiche (AC9)", async () => {
    const seed = await seedAll()
    const earlier = await testDb.select().from(taskEventLog)

    await run(seed)

    const written = (await testDb.select().from(taskEventLog))
      .filter((row) => !earlier.some((old) => old.id === row.id))
      .map((row) => ({
        customerId: row.customerId,
        taskId: row.taskId,
        alertId: row.alertId,
        actorOperatorId: row.actorOperatorId,
        action: row.action,
        source: row.source,
        fromState: row.fromState,
        toState: row.toState,
        fromOperatorId: row.fromOperatorId,
        toOperatorId: row.toOperatorId,
      }))
    const row = (
      customerId: string,
      taskId: number | null,
      toOperatorId: number
    ) => ({
      customerId,
      taskId,
      alertId: null,
      actorOperatorId: seed.admin.id,
      action: "operator_reassign",
      source: "deactivation",
      fromState: null,
      toState: null,
      fromOperatorId: seed.leaving.id,
      toOperatorId,
    })
    expect(written).toHaveLength(5)
    expect(written).toEqual(
      expect.arrayContaining([
        row(seed.ofLeaving.id, null, seed.target.id),
        row(seed.ofLeaving.id, seed.active.id, seed.target.id),
        row(seed.bare.id, null, seed.target.id),
        row(seed.orphan.id, seed.orphanContact.id, seed.target.id),
        row(seed.ofColleague.id, seed.colleagueContact.id, seed.colleague.id),
      ])
    )
    // The customer's row before its contact's, as moveCustomerAndContact
    expect((await logOf(seed.ofLeaving.id)).slice(1)).toMatchObject([
      { taskId: null },
      { taskId: seed.active.id },
    ])
  })

  it("non cambia i contatti non attivi, stato, priorità e richiami dei contatti spostati, resolved_by, il log già scritto, la chat e gli account (AC10)", async () => {
    const seed = await seedAll()
    const [inactiveBefore] = await testDb
      .select()
      .from(task)
      .where(eq(task.id, seed.inactive.id))
    const earlierLog = await testDb.select().from(taskEventLog)
    const chatRows = await testDb.select().from(chatToOperator)
    const accountRows = await testDb.select().from(accounts)
    const alerts = await testDb.select().from(alert).orderBy(asc(alert.id))

    await run(seed)

    const [inactive] = await testDb
      .select()
      .from(task)
      .where(eq(task.id, seed.inactive.id))
    expect(inactive).toEqual(inactiveBefore)
    const [active] = await testDb
      .select()
      .from(task)
      .where(eq(task.id, seed.active.id))
    expect(active).toMatchObject({
      state: "richiamare",
      priority: 77,
      customPriority: true,
      alertId: seed.callback.id,
      isActive: true,
      closedAt: seed.active.closedAt,
    })
    expect(await testDb.select().from(alert).orderBy(asc(alert.id))).toEqual(
      alerts
    )
    expect(
      await testDb
        .select()
        .from(taskEventLog)
        .where(
          inArray(
            taskEventLog.id,
            earlierLog.map((row) => row.id)
          )
        )
    ).toEqual(earlierLog)
    expect(await testDb.select().from(chatToOperator)).toEqual(chatRows)
    expect(await testDb.select().from(accounts)).toEqual(accountRows)
  })

  it("se la scrittura del log fallisce, il database resta com'era: utente attivo, sessioni presenti (AC8)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const seed = await seedAll()
    const before = await snapshot()
    await failNextInsertInto(taskEventLog)

    const exit = await run(seed)

    expect(failureTag(exit)).toBe("DbError")
    expect(await snapshot()).toEqual(before)
    expect((await userOf(seed.leaving.id)).disabledAt).toBeNull()
    expect(await sessionsOf(seed.leaving.userId)).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it("un operatore senza clienti, contatti né pratiche si disattiva con zero spostamenti", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )

    expect(exit).toEqual(
      Exit.succeed({ customersMoved: 0, contactsMoved: 0, practicesMoved: 0 })
    )
    expect((await userOf(leaving.id)).disabledBy).toBe(admin.id)
    expect(await testDb.select().from(taskEventLog)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// La forma delle query (AC9, AC11, AC12)

/** The SQL and parameters of the queries the next transaction runs. */
const recordTransaction = () => {
  const statements: { sql: string; params: unknown[] }[] = []
  const transaction = testClient.transaction.bind(testClient)
  const spy = vi
    .spyOn(testClient, "transaction")
    .mockImplementation((callback) =>
      transaction((tx) => {
        const run = tx.query.bind(tx)
        tx.query = (async (sql: string, params?: unknown[], ...rest: []) => {
          statements.push({ sql, params: params ?? [] })
          return run(sql, params, ...rest)
        }) as typeof tx.query
        return callback(tx)
      })
    )
  return { statements, restore: () => spy.mockRestore() }
}

describe("deactivateOperator: le query", () => {
  it("blocca prima gli utenti (FOR UPDATE OF users, per id), poi i clienti, poi i contatti, e scrive log e aggiornamenti per insiemi, senza id come parametri", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    // More rows than any statement has parameters: none takes one per row
    for (let i = 0; i < 10; i++) {
      const customer = await createCustomer({ operatorId: leaving.id })
      await createTask({ customerId: customer.id, operatorId: leaving.id })
    }
    const recorded = recordTransaction()

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      })
    )
    recorded.restore()

    expect(exit).toEqual(
      Exit.succeed({ customersMoved: 10, contactsMoved: 10, practicesMoved: 0 })
    )
    const sqls = recorded.statements.map(({ sql }) => sql)
    const index = (pattern: RegExp) => sqls.findIndex((s) => pattern.test(s))

    // The first statement that reads a table locks the two users, by id
    const usersLock = index(/for update of "mito-deutsche_user"$/)
    expect(usersLock).toBe(index(/^select /))
    expect(sqls[usersLock]).toMatch(/order by "mito-deutsche_user"\."id"/)
    const customersLock = index(
      /^select "id" from "mito-deutsche_customers" .*order by "mito-deutsche_customers"\."id" for update$/
    )
    const contactsLock = index(
      /^select "id" from "mito-deutsche_task" .*order by "mito-deutsche_task"\."id" for update$/
    )
    const logInsert = index(/^\s*insert into "mito-deutsche_task_event_log"/)
    const customersUpdate = index(/^update "mito-deutsche_customers"/)
    expect(usersLock).toBeLessThan(customersLock)
    expect(customersLock).toBeLessThan(contactsLock)
    expect(contactsLock).toBeLessThan(logInsert)
    expect(logInsert).toBeLessThan(customersUpdate)
    // A lock on a join always names its table
    for (const statement of sqls.filter((s) => / join .*for update/.test(s))) {
      expect(statement).toMatch(/for update of "mito-deutsche_user"$/)
    }

    // One INSERT … SELECT, no VALUES; no statement grows with the rows
    const inserts = sqls.filter((s) => /insert into/i.test(s))
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatch(/\)\s*select /)
    expect(inserts[0]).not.toMatch(/\bvalues\b/i)
    for (const { params } of recorded.statements) {
      expect(params.length).toBeLessThan(10)
    }
  })
})

describe("deactivationImpact", () => {
  it("conta i clienti, i contatti attivi e le pratiche dell'operatore", async () => {
    const leaving = await createOperator()
    const colleague = await createOperator()
    const a = await createCustomer({ operatorId: leaving.id })
    await createTask({
      customerId: a.id,
      operatorId: leaving.id,
      isActive: false,
    })
    await createTask({ customerId: a.id, operatorId: leaving.id })
    await createCustomer({ operatorId: leaving.id })
    const other = await createCustomer({ operatorId: colleague.id })
    await createTask({ customerId: other.id, operatorId: leaving.id })
    await createPractice({ customerId: a.id, operatorId: leaving.id })
    await createPractice({ customerId: other.id, operatorId: colleague.id })

    const exit = await runServer(deactivationImpact(leaving.id))

    expect(exit).toEqual(
      Exit.succeed({ customers: 2, contacts: 2, practices: 1 })
    )
  })

  it("un operatore senza nulla ha zero ovunque", async () => {
    const leaving = await createOperator()

    expect(await runServer(deactivationImpact(leaving.id))).toEqual(
      Exit.succeed({ customers: 0, contacts: 0, practices: 0 })
    )
  })
})
