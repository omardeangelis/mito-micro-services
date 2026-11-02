import { afterEach, beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"
import { TestClock } from "effect/testing"
import { asc, eq } from "drizzle-orm"
import { type TaskStatus } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { convertContactStates } from "../convertStates"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { beforeNextLockOf } from "@/test/failpoint"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import { assertCustomerLockedOnWrite } from "@/test/lockRule"

// The conversion of esiti-richiami-stati (AC31, AC32): the instant of the run
// is 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
// Alert deadlines around that day, in Rome
const FUTURE = new Date("2026-11-10T08:00:00.000Z")
const DUE_TODAY = new Date("2026-11-02T07:00:00.000Z")
const EXPIRED = new Date("2026-10-28T08:00:00.000Z")
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A run of the conversion at NOW, with time to spare. */
const convert = () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    const exit = yield* convertContactStates({ budgetMs: 60_000 }).pipe(
      provideServer,
      Effect.exit
    )
    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    return exit.value
  })

/** The counts of a run that changed nothing. */
const nothing = {
  orphanAlerts: 0,
  futureAlert: 0,
  dueAlert: 0,
  noAlert: 0,
  legacyToCall: 0,
  legacyErogata: 0,
  failed: 0,
  remaining: 0,
}

type Operator = Awaited<ReturnType<typeof createOperator>>

/**
 * A contact of `operator` in `state` on a new customer, active unless said
 * otherwise, with a manual priority and «Contattato il», and an open alert
 * due on `alertAt` when given.
 */
const contactOf = (
  operator: Operator,
  state: TaskStatus | null,
  { alertAt, isActive = true }: { alertAt?: Date; isActive?: boolean } = {}
) =>
  given(async () => {
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state,
      isActive,
      closedAt: LONG_AGO,
      priority: 77,
      customPriority: true,
    })
    const open = alertAt
      ? await createAlert({ taskId: contact.id, deadline: alertAt })
      : null
    return { customer, contact, open }
  })

const taskRow = (id: number) =>
  given(() =>
    testDb
      .select()
      .from(task)
      .where(eq(task.id, id))
      .then(([row]) => row!)
  )

const alertRow = (id: number) =>
  given(() =>
    testDb
      .select()
      .from(alert)
      .where(eq(alert.id, id))
      .then(([row]) => row!)
  )

/** Every row the conversion may write. */
const snapshot = () =>
  given(async () => ({
    tasks: await testDb.select().from(task).orderBy(asc(task.id)),
    alerts: await testDb.select().from(alert).orderBy(asc(alert.id)),
    log: await testDb.select().from(taskEventLog),
  }))

let system: Awaited<ReturnType<typeof createSystemOperator>>

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  system = await createSystemOperator()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("convertContactStates: rilanciabile (AC31, AC32)", () => {
  it.effect(
    "un contatto attivo in richiamare senza alert aperto va in Non risponde, e un secondo giro lascia tutti i contatti come dopo il primo",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator, "richiamare")
        yield* contactOf(operator, "followup")
        yield* contactOf(operator, "nessuno", { alertAt: FUTURE })

        expect(yield* convert()).toEqual({
          ...nothing,
          noAlert: 1,
          futureAlert: 1,
          legacyToCall: 1,
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "non risponde",
        })
        const after = yield* snapshot()

        expect(yield* convert()).toEqual(nothing)
        expect(yield* snapshot()).toEqual(after)
      })
  )

  it.effect(
    "un giro dopo l'inserimento di un followup cambia solo quello",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        yield* contactOf(operator, "richiamare")
        yield* contactOf(operator, "erogata", { isActive: false })
        yield* convert()
        const before = yield* snapshot()

        const { contact } = yield* contactOf(operator, "followup")
        expect(yield* convert()).toEqual({ ...nothing, legacyToCall: 1 })

        const after = yield* snapshot()
        expect(after.tasks.filter(({ id }) => id !== contact.id)).toEqual(
          before.tasks
        )
        expect(after.tasks.find(({ id }) => id === contact.id)).toMatchObject({
          state: "chiamare",
        })
        expect(after.alerts).toEqual(before.alerts)
        expect(after.log).toEqual([])
      })
  )
})

describe("convertContactStates: le regole del secondo passo (AC31)", () => {
  it.effect("ogni contatto va dove dice la prima regola che lo riguarda", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      // 1. An open future alert: Richiamo, whatever the state
      const nessunoFuture = yield* contactOf(operator, "nessuno", {
        alertAt: FUTURE,
      })
      const notInterestedFuture = yield* contactOf(
        operator,
        "non interessato",
        { alertAt: FUTURE }
      )
      const noAnswerFuture = yield* contactOf(operator, "non risponde", {
        alertAt: FUTURE,
      })
      // 2. An open alert expired or of today: Da chiamare, the alert stays
      const appointmentExpired = yield* contactOf(operator, "app.to", {
        alertAt: EXPIRED,
      })
      const erogataToday = yield* contactOf(operator, "erogata", {
        alertAt: DUE_TODAY,
      })
      const callbackExpired = yield* contactOf(operator, "richiamare", {
        alertAt: EXPIRED,
      })
      // 3. richiamare without an open alert: Non risponde
      const callbackNoAlert = yield* contactOf(operator, "richiamare")
      // 4. followup, nessuno and no state: Da chiamare, active or not
      const followup = yield* contactOf(operator, "followup")
      const nessunoOld = yield* contactOf(operator, "nessuno", {
        isActive: false,
      })
      const empty = yield* contactOf(operator, null)
      const noCustomer = yield* given(() =>
        createTask({ state: "followup", isActive: false })
      )
      // 5. erogata: Pratica caricata, active or not
      const erogata = yield* contactOf(operator, "erogata")
      const erogataOld = yield* contactOf(operator, "erogata", {
        isActive: false,
      })

      expect(yield* convert()).toEqual({
        ...nothing,
        futureAlert: 3,
        dueAlert: 3,
        noAlert: 1,
        legacyToCall: 4,
        legacyErogata: 2,
      })

      const expected: [{ contact: { id: number } }, TaskStatus][] = [
        [nessunoFuture, "richiamare"],
        [notInterestedFuture, "richiamare"],
        [noAnswerFuture, "richiamare"],
        [appointmentExpired, "chiamare"],
        [erogataToday, "chiamare"],
        [callbackExpired, "chiamare"],
        [callbackNoAlert, "non risponde"],
        [followup, "chiamare"],
        [nessunoOld, "chiamare"],
        [empty, "chiamare"],
        [{ contact: noCustomer }, "chiamare"],
        [erogata, "caricato"],
        [erogataOld, "caricato"],
      ]
      for (const [{ contact }, state] of expected) {
        expect(yield* taskRow(contact.id)).toMatchObject({
          id: contact.id,
          state,
        })
      }
      // The alerts of rules 1 and 2 stay open and linked
      for (const { contact, open } of [
        nessunoFuture,
        appointmentExpired,
        erogataToday,
        callbackExpired,
      ]) {
        expect(yield* alertRow(open!.id)).toMatchObject({
          isResolved: false,
          resolution: null,
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          alertId: open!.id,
        })
      }
    })
  )

  it.effect(
    "non scrive nel registro e non cambia operatore, priorità manuale e «Contattato il» (AC32)",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator, "richiamare")
        const before = yield* taskRow(contact.id)

        yield* convert()

        const after = yield* taskRow(contact.id)
        expect(after).toMatchObject({
          state: "non risponde",
          operatorId: before.operatorId,
          priority: 77,
          customPriority: true,
          closedAt: LONG_AGO,
          isActive: true,
        })
        expect((yield* snapshot()).log).toEqual([])
      })
  )

  it.effect(
    "lascia com'è un Non risponde o un Da chiamare con un alert scaduto o di oggi, un Richiamo con un alert futuro e i contatti già nei sei stati",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        yield* contactOf(operator, "non risponde", { alertAt: EXPIRED })
        yield* contactOf(operator, "non risponde", { alertAt: DUE_TODAY })
        yield* contactOf(operator, "chiamare", { alertAt: EXPIRED })
        yield* contactOf(operator, "richiamare", { alertAt: FUTURE })
        for (const state of [
          "chiamare",
          "non risponde",
          "app.to",
          "caricato",
          "non interessato",
        ] as const) {
          yield* contactOf(operator, state)
        }
        const before = yield* snapshot()

        expect(yield* convert()).toEqual(nothing)
        expect(yield* snapshot()).toEqual(before)
      })
  )

  it.effect(
    "lascia in richiamare un contatto non attivo, che si mostra come Richiamo",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator, "richiamare", {
          isActive: false,
        })

        expect(yield* convert()).toEqual(nothing)
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "richiamare",
        })
      })
  )
})

describe("convertContactStates: gli alert orfani (AC31 primo passo, AC23)", () => {
  it.effect(
    "chiude dal sistema l'alert aperto di un contatto non attivo, senza scrivere nel registro né cambiarne lo stato",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "app.to",
          { alertAt: FUTURE, isActive: false }
        )
        const active = yield* given(() =>
          createTask({ customerId: customer.id, state: "chiamare" })
        )

        expect(yield* convert()).toEqual({ ...nothing, orphanAlerts: 1 })

        expect(yield* alertRow(open!.id)).toMatchObject({
          isResolved: true,
          resolution: "system",
          resolvedBy: system.id,
          resolvedAt: NOW,
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "app.to",
          alertId: null,
        })
        expect(yield* taskRow(active.id)).toMatchObject({ state: "chiamare" })
        expect((yield* snapshot()).log).toEqual([])
      })
  )

  it.effect(
    "chiude l'alert aperto di una task che non lo collega più, e lascia aperto quello collegato al contatto attivo",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { contact, open: linked } = yield* contactOf(
          operator,
          "richiamare",
          { alertAt: FUTURE }
        )
        // An older alert of the same contact, left open when the new one
        // took its place
        const [stale] = yield* given(() =>
          testDb
            .insert(alert)
            .values({ taskId: contact.id, deadline: EXPIRED })
            .returning()
        )

        expect(yield* convert()).toEqual({ ...nothing, orphanAlerts: 1 })

        expect(yield* alertRow(stale!.id)).toMatchObject({
          isResolved: true,
          resolution: "system",
        })
        expect(yield* alertRow(linked!.id)).toMatchObject({
          isResolved: false,
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "richiamare",
          alertId: linked!.id,
        })
      })
  )

  it.effect("senza l'operatore di sistema fallisce senza scrivere", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      yield* contactOf(operator, "app.to", {
        alertAt: FUTURE,
        isActive: false,
      })
      yield* contactOf(operator, "followup")
      yield* given(() => resetSystemOperator())
      const before = yield* snapshot()

      yield* TestClock.setTime(NOW.getTime())
      const exit = yield* convertContactStates({ budgetMs: 60_000 }).pipe(
        provideServer,
        Effect.exit
      )

      expect(failureTag(exit)).toBe("SystemOperatorMissing")
      expect(yield* snapshot()).toEqual(before)
    })
  )
})

describe("convertContactStates: concorrenza e lock (AC32)", () => {
  it.effect(
    "una chiamata registrata mentre la conversione aspettava il lock del cliente vince",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator, "richiamare")
        // What an Appuntamento registered by a colleague writes, committed
        // after the conversion read its contacts and before it got the lock
        beforeNextLockOf(
          customers,
          `UPDATE "mito-deutsche_task" SET state = 'app.to', closed_at = '${NOW.toISOString()}' WHERE id = ${contact.id}`
        )

        expect(yield* convert()).toEqual(nothing)
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "app.to",
          closedAt: NOW,
        })
      })
  )

  it.effect(
    "prende il lock del cliente prima di ogni scrittura, sugli alert e sui contatti",
    () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const operator = yield* given(() => createOperator())
        yield* contactOf(operator, "app.to", {
          alertAt: FUTURE,
          isActive: false,
        })
        yield* contactOf(operator, "richiamare")
        yield* contactOf(operator, "erogata", { isActive: false })
        yield* given(() => assertCustomerLockedOnWrite())

        expect(yield* convert()).toEqual({
          ...nothing,
          orphanAlerts: 1,
          noAlert: 1,
          legacyErogata: 1,
        })
      })
  )
})

describe("convertContactStates: a tempo", () => {
  // The budget is measured on the real clock: under TestClock no time passes
  it.live(
    "a tempo esaurito lavora solo il primo cliente: gli altri li prende il giro dopo",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        yield* contactOf(operator, "followup")
        yield* contactOf(operator, "erogata")

        const run = () =>
          convertContactStates({ budgetMs: 0 }).pipe(provideServer)
        const first = yield* run()
        expect(first).toMatchObject({ failed: 0, remaining: 1 })
        expect(first.legacyToCall + first.legacyErogata).toBe(1)
        const second = yield* run()
        expect(second).toMatchObject({ failed: 0, remaining: 0 })
        expect(second.legacyToCall + second.legacyErogata).toBe(1)
      })
  )
})

/** Removes the system operator, so the conversion can't find it. */
async function resetSystemOperator() {
  await testDb.delete(operators).where(eq(operators.id, system.id))
}
