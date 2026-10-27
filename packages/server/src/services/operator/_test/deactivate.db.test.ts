import { beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { asc, eq, inArray } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { practices } from "@mito/db/schema/pratiche"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { authSessions } from "@mito/db/schema/auth"
import { accounts, sessions, users } from "@mito/db/schema/users"
import { Db, type DbClient } from "../../../effect/db"
import { actorOf } from "../../contact/actor"
import { deactivateOperator, deactivationImpact } from "../deactivate"
import {
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testClient,
  testDb,
} from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createPractice,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import {
  countStatementsOn,
  failAtCommit,
  failNextInsertInto,
  failNextUpdateOf,
} from "@/test/failpoint"

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
  it.effect(
    "passa alla destinazione un cliente e il suo contatto attivo, con due righe operator_reassign di source deactivation",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() => createOperator())
        const target = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: leaving.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: leaving.id,
          })
        )

        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 1,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        expect(
          yield* Effect.promise(() => operatorOfCustomer(customer.id))
        ).toBe(target.id)
        const [moved] = yield* Effect.promise(() => tasksOf(customer.id))
        expect(moved).toMatchObject({ id: contact.id, operatorId: target.id })
        const log = yield* Effect.promise(() => logOf(customer.id))
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
  )
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
  it.effect("un utente ADMIN è rifiutato con OperatorIsAdmin (AC3)", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const { operator: other } = yield* Effect.promise(() =>
        seedPortfolio({ role: "ADMIN" })
      )
      const target = yield* Effect.promise(() => createOperator())
      const before = yield* Effect.promise(() => snapshot())

      const exit = yield* deactivateOperator({
        operatorId: other.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("OperatorIsAdmin")
      expect(yield* Effect.promise(() => snapshot())).toEqual(before)
    })
  )

  it.effect(
    "disattivare sé stessi è rifiutato con CannotDeactivateSelf, prima del controllo sugli admin (AC4)",
    () =>
      Effect.gen(function* () {
        const { operator: admin } = yield* Effect.promise(() =>
          seedPortfolio({ role: "ADMIN" })
        )
        const target = yield* Effect.promise(() => createOperator())
        const before = yield* Effect.promise(() => snapshot())

        const exit = yield* deactivateOperator({
          operatorId: admin.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("CannotDeactivateSelf")
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )

  it.effect("un operatorId inesistente è OperatorNotFound (AC5)", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const target = yield* Effect.promise(() => createOperator())
      yield* Effect.promise(() => seedPortfolio())
      const before = yield* Effect.promise(() => snapshot())

      const exit = yield* deactivateOperator({
        operatorId: 999_999,
        toOperatorId: target.id,
        actor: actorOf(admin),
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("OperatorNotFound")
      expect(yield* Effect.promise(() => snapshot())).toEqual(before)
    })
  )

  it.effect(
    "l'operatore di sistema, senza utente, è OperatorNotFound (AC5)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const target = yield* Effect.promise(() => createOperator())
        const system = yield* Effect.promise(() => createSystemOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: system.id })
        )
        yield* Effect.promise(() =>
          createTask({ customerId: customer.id, operatorId: system.id })
        )
        const before = yield* Effect.promise(() => snapshot())

        const exit = yield* deactivateOperator({
          operatorId: system.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("OperatorNotFound")
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )

  it.effect("un operatore già disattivato è OperatorNotFound (AC5)", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const target = yield* Effect.promise(() => createOperator())
      yield* Effect.promise(() =>
        seedPortfolio({
          disabledAt: new Date("2026-10-01T08:00:00.000Z"),
          disabledBy: admin.id,
        })
      )
      const [disabled] = yield* Effect.promise(() =>
        testDb.select().from(operators).orderBy(asc(operators.id)).offset(2)
      )
      const before = yield* Effect.promise(() => snapshot())

      const exit = yield* deactivateOperator({
        operatorId: disabled!.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("OperatorNotFound")
      expect(yield* Effect.promise(() => snapshot())).toEqual(before)
    })
  )

  it.effect(
    "una destinazione inesistente, disattivata o di sistema è OperatorNotFound (AC6)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const { operator: leaving } = yield* Effect.promise(() =>
          seedPortfolio()
        )
        const disabled = yield* Effect.promise(() =>
          createOperator({
            disabledAt: new Date("2026-10-01T08:00:00.000Z"),
          })
        )
        const system = yield* Effect.promise(() => createSystemOperator())
        const before = yield* Effect.promise(() => snapshot())

        for (const toOperatorId of [999_999, disabled.id, system.id]) {
          const exit = yield* deactivateOperator({
            operatorId: leaving.id,
            toOperatorId,
            actor: actorOf(admin),
          }).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("OperatorNotFound")
        }
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )

  it.effect(
    "una destinazione uguale all'operatore disattivato è HandoverSameOperator (AC6)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const { operator: leaving } = yield* Effect.promise(() =>
          seedPortfolio()
        )
        const before = yield* Effect.promise(() => snapshot())

        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: leaving.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("HandoverSameOperator")
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )
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
    deactivateOperator({
      operatorId: seed.leaving.id,
      toOperatorId: seed.target.id,
      actor: actorOf(seed.admin),
    }).pipe(provideServer, Effect.exit)

  it.effect(
    "risponde con i conteggi: due clienti, tre contatti attivi, una pratica (AC13)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())

        const exit = yield* run(seed)

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 2,
            contactsMoved: 3,
            practicesMoved: 1,
          })
        )
      })
  )

  it.effect(
    "disattiva l'utente con l'admin in disabled_by e ne cancella le sessioni (AC8a, AC8e)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())
        const before = Date.now()

        yield* run(seed)

        const user = yield* Effect.promise(() => userOf(seed.leaving.id))
        expect(user.disabledBy).toBe(seed.admin.id)
        expect(user.disabledAt).toBeInstanceOf(Date)
        expect(user.disabledAt!.getTime()).toBeGreaterThan(before - 60_000)
        expect(
          yield* Effect.promise(() => sessionsOf(seed.leaving.userId))
        ).toEqual([])
        expect(
          yield* Effect.promise(() => sessionsOf(seed.colleague.userId))
        ).toMatchObject([{ sessionToken: seed.otherSession }])
        expect(
          (yield* Effect.promise(() => userOf(seed.target.id))).disabledAt
        ).toBeNull()
      })
  )

  it.effect(
    "cancella anche le sessioni di better-auth dell'utente, solo le sue (spec auth-better-auth, AC15)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())
        const addAuthSession = (userId: string) =>
          testDb.insert(authSessions).values({
            id: `auth-${userId}`,
            token: `token-${userId}`,
            userId,
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          })
        yield* Effect.promise(() => addAuthSession(seed.leaving.userId))
        yield* Effect.promise(() => addAuthSession(seed.colleague.userId))

        yield* run(seed)

        expect(
          yield* Effect.promise(() =>
            testDb
              .select({ userId: authSessions.userId })
              .from(authSessions)
              .orderBy(asc(authSessions.userId))
          )
        ).toEqual([{ userId: seed.colleague.userId }])
      })
  )

  it.effect(
    "i clienti dell'operatore e le sue pratiche passano alla destinazione; gli altri clienti no (AC8b, AC8d)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())

        yield* run(seed)

        expect(
          yield* Effect.promise(() => operatorOfCustomer(seed.ofLeaving.id))
        ).toBe(seed.target.id)
        expect(
          yield* Effect.promise(() => operatorOfCustomer(seed.bare.id))
        ).toBe(seed.target.id)
        expect(
          yield* Effect.promise(() => operatorOfCustomer(seed.orphan.id))
        ).toBeNull()
        expect(
          yield* Effect.promise(() => operatorOfCustomer(seed.ofColleague.id))
        ).toBe(seed.colleague.id)
        expect(
          yield* Effect.promise(() => operatorOfCustomer(seed.untouched.id))
        ).toBe(seed.colleague.id)
        const rows = yield* Effect.promise(() =>
          testDb
            .select({
              id: practices.praticaId,
              operatorId: practices.operatorId,
            })
            .from(practices)
            .orderBy(asc(practices.praticaId))
        )
        expect(rows).toEqual(
          expect.arrayContaining([
            { id: seed.practice.praticaId, operatorId: seed.target.id },
            { id: seed.otherPractice.praticaId, operatorId: seed.colleague.id },
          ])
        )
      })
  )

  it.effect(
    "ogni contatto attivo passa all'operatore del suo cliente dopo lo spostamento, o alla destinazione se il cliente non ne ha (AC8c)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())

        yield* run(seed)

        const operatorOfTask = async (id: number) =>
          (await testDb.select().from(task).where(eq(task.id, id)))[0]!
            .operatorId
        expect(
          yield* Effect.promise(() => operatorOfTask(seed.active.id))
        ).toBe(seed.target.id)
        expect(
          yield* Effect.promise(() => operatorOfTask(seed.orphanContact.id))
        ).toBe(seed.target.id)
        expect(
          yield* Effect.promise(() => operatorOfTask(seed.colleagueContact.id))
        ).toBe(seed.colleague.id)
        expect(
          yield* Effect.promise(() => operatorOfTask(seed.untouchedContact.id))
        ).toBe(seed.colleague.id)
      })
  )

  it.effect(
    "scrive una riga operator_reassign per cliente e per contatto attivo spostati, e nessuna per le pratiche (AC9)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())
        const earlier = yield* Effect.promise(() =>
          testDb.select().from(taskEventLog)
        )

        yield* run(seed)

        const written = (yield* Effect.promise(() =>
          testDb.select().from(taskEventLog)
        ))
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
            row(
              seed.ofColleague.id,
              seed.colleagueContact.id,
              seed.colleague.id
            ),
          ])
        )
        // The customer's row before its contact's, as moveCustomerAndContact
        expect(
          (yield* Effect.promise(() => logOf(seed.ofLeaving.id))).slice(1)
        ).toMatchObject([{ taskId: null }, { taskId: seed.active.id }])
      })
  )

  it.effect(
    "non cambia i contatti non attivi, stato, priorità e richiami dei contatti spostati, resolved_by, il log già scritto, la chat e gli account (AC10)",
    () =>
      Effect.gen(function* () {
        const seed = yield* Effect.promise(() => seedAll())
        const [inactiveBefore] = yield* Effect.promise(() =>
          testDb.select().from(task).where(eq(task.id, seed.inactive.id))
        )
        const earlierLog = yield* Effect.promise(() =>
          testDb.select().from(taskEventLog)
        )
        const chatRows = yield* Effect.promise(() =>
          testDb.select().from(chatToOperator)
        )
        const accountRows = yield* Effect.promise(() =>
          testDb.select().from(accounts)
        )
        const alerts = yield* Effect.promise(() =>
          testDb.select().from(alert).orderBy(asc(alert.id))
        )

        yield* run(seed)

        const [inactive] = yield* Effect.promise(() =>
          testDb.select().from(task).where(eq(task.id, seed.inactive.id))
        )
        expect(inactive).toEqual(inactiveBefore)
        const [active] = yield* Effect.promise(() =>
          testDb.select().from(task).where(eq(task.id, seed.active.id))
        )
        expect(active).toMatchObject({
          state: "richiamare",
          priority: 77,
          customPriority: true,
          alertId: seed.callback.id,
          isActive: true,
          closedAt: seed.active.closedAt,
        })
        expect(
          yield* Effect.promise(() =>
            testDb.select().from(alert).orderBy(asc(alert.id))
          )
        ).toEqual(alerts)
        expect(
          yield* Effect.promise(() =>
            testDb
              .select()
              .from(taskEventLog)
              .where(
                inArray(
                  taskEventLog.id,
                  earlierLog.map((row) => row.id)
                )
              )
          )
        ).toEqual(earlierLog)
        expect(
          yield* Effect.promise(() => testDb.select().from(chatToOperator))
        ).toEqual(chatRows)
        expect(
          yield* Effect.promise(() => testDb.select().from(accounts))
        ).toEqual(accountRows)
      })
  )

  it.effect(
    "se la scrittura del log fallisce, il database resta com'era: utente attivo, sessioni presenti (AC8)",
    () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const seed = yield* Effect.promise(() => seedAll())
        const before = yield* Effect.promise(() => snapshot())
        yield* Effect.promise(() => failNextInsertInto(taskEventLog))

        const exit = yield* run(seed)

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
        expect(
          (yield* Effect.promise(() => userOf(seed.leaving.id))).disabledAt
        ).toBeNull()
        expect(
          yield* Effect.promise(() => sessionsOf(seed.leaving.userId))
        ).toHaveLength(2)
        vi.restoreAllMocks()
      })
  )

  it.effect.each([
    [
      "l'ultimo UPDATE, quello dell'utente,",
      (seed: Awaited<ReturnType<typeof seedAll>>) =>
        failNextUpdateOf(users, { id: seed.leaving.userId }),
    ],
    ["il COMMIT", () => failAtCommit(users)],
  ])(
    "se %s fallisce dopo gli spostamenti, il database resta com'era: utente attivo, sessioni presenti (AC8)",
    (testCase) =>
      Effect.gen(function* () {
        const fail = testCase[1] as (
          seed: Awaited<ReturnType<typeof seedAll>>
        ) => Promise<unknown>
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const seed = yield* Effect.promise(() => seedAll())
        const before = yield* Effect.promise(() => snapshot())
        // The practices move after customers, contacts and log: one UPDATE of
        // them shows the moves ran before the failure
        const practicesUpdates = yield* Effect.promise(() =>
          countStatementsOn(practices, "UPDATE")
        )
        yield* Effect.promise(() => fail(seed))

        const exit = yield* run(seed)

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => practicesUpdates())).toBe(1)
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
        expect(
          (yield* Effect.promise(() => userOf(seed.leaving.id))).disabledAt
        ).toBeNull()
        expect(
          yield* Effect.promise(() => sessionsOf(seed.leaving.userId))
        ).toHaveLength(2)
        vi.restoreAllMocks()
      })
  )

  it.effect(
    "un contatto attivo dell'operatore senza cliente passa alla destinazione e conta in contactsMoved e nell'impatto, senza riga nel log",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() => createOperator())
        const target = yield* Effect.promise(() => createOperator())
        const loose = yield* Effect.promise(() =>
          createTask({ customerId: null, operatorId: leaving.id })
        )

        expect(
          yield* deactivationImpact(leaving.id).pipe(provideServer, Effect.exit)
        ).toEqual(Exit.succeed({ customers: 0, contacts: 1, practices: 0 }))
        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 0,
            contactsMoved: 1,
            practicesMoved: 0,
          })
        )
        const [moved] = yield* Effect.promise(() =>
          testDb.select().from(task).where(eq(task.id, loose.id))
        )
        expect(moved).toMatchObject({ operatorId: target.id, isActive: true })
        // `task_event_log.customer_id` is required: no row for it
        expect(
          yield* Effect.promise(() => testDb.select().from(taskEventLog))
        ).toEqual([])
      })
  )

  it.effect(
    "un operatore senza clienti, contatti né pratiche si disattiva con zero spostamenti",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() => createOperator())
        const target = yield* Effect.promise(() => createOperator())

        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 0,
            contactsMoved: 0,
            practicesMoved: 0,
          })
        )
        expect(
          (yield* Effect.promise(() => userOf(leaving.id))).disabledBy
        ).toBe(admin.id)
        expect(
          yield* Effect.promise(() => testDb.select().from(taskEventLog))
        ).toEqual([])
      })
  )
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
  it.effect(
    "blocca prima gli utenti (FOR UPDATE OF users, per id), poi i clienti, poi i contatti, e scrive log e aggiornamenti per insiemi, senza id come parametri",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const leaving = yield* Effect.promise(() => createOperator())
        const target = yield* Effect.promise(() => createOperator())
        // More rows than any statement has parameters: none takes one per row
        for (let i = 0; i < 10; i++) {
          const customer = yield* Effect.promise(() =>
            createCustomer({ operatorId: leaving.id })
          )
          yield* Effect.promise(() =>
            createTask({ customerId: customer.id, operatorId: leaving.id })
          )
        }
        const recorded = recordTransaction()

        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(provideServer, Effect.exit)
        recorded.restore()

        expect(exit).toEqual(
          Exit.succeed({
            customersMoved: 10,
            contactsMoved: 10,
            practicesMoved: 0,
          })
        )
        const sqls = recorded.statements.map(({ sql }) => sql)
        const index = (pattern: RegExp) =>
          sqls.findIndex((s) => pattern.test(s))

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
        // Customers, contacts and log in one statement, after the locks: its
        // CTEs share one snapshot, so the log rows are what the updates moved
        const move = index(/^with "moved_customers" as \(/)
        expect(usersLock).toBeLessThan(customersLock)
        expect(customersLock).toBeLessThan(contactsLock)
        expect(contactsLock).toBeLessThan(move)
        expect(sqls[move]).toMatch(
          /\(\s*update "mito-deutsche_customers"\s.*\(\s*update "mito-deutsche_task"\s.*\(\s*insert into "mito-deutsche_task_event_log"/s
        )
        // No other statement writes the customers, the contacts or the log
        expect(
          sqls.filter((s) =>
            /\b(update|insert into) "mito-deutsche_(customers|task|task_event_log)"/.test(
              s
            )
          )
        ).toEqual([sqls[move]])
        // A lock on a join always names its table
        for (const statement of sqls.filter((s) =>
          / join .*for update/.test(s)
        )) {
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
  )
})

describe("deactivateOperator: i deadlock", () => {
  /** `testDb`, counting the transactions opened on it. */
  const countingDb = () => {
    const counter = { transactions: 0 }
    const client = new Proxy(testDb, {
      get(target, property, receiver) {
        if (property !== "transaction") {
          return Reflect.get(target, property, receiver) as unknown
        }
        return (...args: Parameters<typeof testDb.transaction>) => {
          counter.transactions += 1
          return target.transaction(...args)
        }
      },
    }) as unknown as DbClient
    return { client, counter }
  }

  /** An operator with a customer, whose log row is the first insert. */
  const seedDeadlocks = async (deadlocks: number) => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    await createCustomer({ operatorId: leaving.id })
    // Each failpoint fails one attempt: the first insert it sees
    for (let i = 0; i < deadlocks; i++) {
      await failNextInsertInto(taskEventLog, {}, { sqlstate: "40P01" })
    }
    return { admin, leaving, target }
  }

  it.effect(
    "un deadlock a ogni tentativo: tre transazioni (due ripetizioni al massimo), poi il DbError 40P01, e niente cambia",
    () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const { admin, leaving, target } = yield* Effect.promise(() =>
          seedDeadlocks(4)
        )
        const before = yield* Effect.promise(() => snapshot())
        const { client, counter } = countingDb()

        const exit = yield* deactivateOperator({
          operatorId: leaving.id,
          toOperatorId: target.id,
          actor: actorOf(admin),
        }).pipe(Effect.provideService(Db, client), provideServer, Effect.exit)

        expect(counter.transactions).toBe(3)
        expect(exit).toEqual(
          Exit.fail(expect.objectContaining({ _tag: "DbError", code: "40P01" }))
        )
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
        vi.restoreAllMocks()
      })
  )

  it.effect("due deadlock: la terza transazione riesce", () =>
    Effect.gen(function* () {
      const { admin, leaving, target } = yield* Effect.promise(() =>
        seedDeadlocks(2)
      )
      const { client, counter } = countingDb()

      const exit = yield* deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: actorOf(admin),
      }).pipe(Effect.provideService(Db, client), provideServer, Effect.exit)

      expect(counter.transactions).toBe(3)
      expect(exit).toEqual(
        Exit.succeed({ customersMoved: 1, contactsMoved: 0, practicesMoved: 0 })
      )
    })
  )
})

describe("deactivationImpact", () => {
  it.effect(
    "conta i clienti, i contatti attivi e le pratiche dell'operatore",
    () =>
      Effect.gen(function* () {
        const leaving = yield* Effect.promise(() => createOperator())
        const colleague = yield* Effect.promise(() => createOperator())
        const a = yield* Effect.promise(() =>
          createCustomer({ operatorId: leaving.id })
        )
        yield* Effect.promise(() =>
          createTask({
            customerId: a.id,
            operatorId: leaving.id,
            isActive: false,
          })
        )
        yield* Effect.promise(() =>
          createTask({ customerId: a.id, operatorId: leaving.id })
        )
        yield* Effect.promise(() => createCustomer({ operatorId: leaving.id }))
        const other = yield* Effect.promise(() =>
          createCustomer({ operatorId: colleague.id })
        )
        yield* Effect.promise(() =>
          createTask({ customerId: other.id, operatorId: leaving.id })
        )
        yield* Effect.promise(() =>
          createPractice({ customerId: a.id, operatorId: leaving.id })
        )
        yield* Effect.promise(() =>
          createPractice({ customerId: other.id, operatorId: colleague.id })
        )

        const exit = yield* deactivationImpact(leaving.id).pipe(
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(
          Exit.succeed({ customers: 2, contacts: 2, practices: 1 })
        )
      })
  )

  it.effect("un operatore senza nulla ha zero ovunque", () =>
    Effect.gen(function* () {
      const leaving = yield* Effect.promise(() => createOperator())

      expect(
        yield* deactivationImpact(leaving.id).pipe(provideServer, Effect.exit)
      ).toEqual(Exit.succeed({ customers: 0, contacts: 0, practices: 0 }))
    })
  )
})
