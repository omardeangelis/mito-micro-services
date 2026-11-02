import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { asc, eq } from "drizzle-orm"
import { type Role } from "@mito/domain/contact/permissions"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
import {
  AlertConfirmationRequired,
  CallAlreadyWorked,
  CallNotAllowed,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  DeadlineInPast,
  MessageTooLong,
  RequestIdConflict,
} from "../errors"
import { type CallInput, registerCall } from "../registerCall"
import { customerRow, logOf, migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// The server's instant of every call: 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const TODAY = "2026-11-02"
// Alert deadlines around today, in Rome
const FUTURE = new Date("2026-11-10T08:00:00.000Z")
const DUE_TODAY = new Date("2026-11-02T07:00:00.000Z")
const EXPIRED = new Date("2026-10-28T08:00:00.000Z")
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const actorOf = (operator: { id: number }, role: Role = "OPERATORE") => ({
  operatorId: operator.id,
  role,
})

type Operator = Awaited<ReturnType<typeof createOperator>>

/**
 * A customer of `operator` with an active contact of theirs in `state`, and an
 * open alert due on `alertAt` when given.
 */
const contactOf = (
  operator: Operator,
  state: TaskStatus = "chiamare",
  alertAt?: Date
) =>
  given(async () => {
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: LONG_AGO,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state,
      closedAt: LONG_AGO,
    })
    const open = alertAt
      ? await createAlert({
          taskId: contact.id,
          deadline: alertAt,
          message: "Richiamare dopo le 18",
        })
      : null
    return { customer, contact, open }
  })

/** The input of a press, outcome by outcome, without the actor. */
type Press = CallInput extends infer Input
  ? Input extends CallInput
    ? Omit<Input, "actor" | "requestId" | "source"> &
        Partial<Pick<Input, "requestId" | "source">>
    : never
  : never

/** A press of an outcome by `operator`: a new request id each time. */
const press = (operator: Operator, input: Press, role: Role = "OPERATORE") =>
  registerCall({
    requestId: crypto.randomUUID(),
    source: "detail",
    ...input,
    actor: actorOf(operator, role),
  } as CallInput).pipe(provideServer)

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

const callsOf = (customerId: string) =>
  given(() =>
    logOf(customerId).then((rows) =>
      rows.filter(({ action }) => action === "call")
    )
  )

/** Everything a call may write, for one customer. */
const snapshot = (customerId: string) =>
  given(async () => ({
    tasks: await testDb
      .select()
      .from(task)
      .where(eq(task.customerId, customerId))
      .orderBy(asc(task.id)),
    alerts: await testDb.select().from(alert).orderBy(asc(alert.id)),
    log: await logOf(customerId),
    customer: await customerRow(customerId),
  }))

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("registerCall: una chiamata per ogni invio (AC9, AC11)", () => {
  it.effect(
    "due Non risponde di fila su un contatto Da chiamare scrivono due chiamate, lo stesso requestId mandato due volte una sola",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator)

        yield* press(operator, { taskId: contact.id, outcome: "non risponde" })
        const requestId = crypto.randomUUID()
        const first = yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          requestId,
        })
        const again = yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          requestId,
        })

        const calls = yield* callsOf(customer.id)
        expect(calls).toMatchObject([
          { outcome: "non risponde", toState: "non risponde" },
          { outcome: "non risponde", requestId },
        ])
        expect(calls).toHaveLength(2)
        expect(again).toEqual(first)
      })
  )
})

describe("registerCall: esiti (AC8, AC10, AC29)", () => {
  it.effect(
    "Non risponde senza alert: Non risponde, origine lista, la riga con chi, quando e da dove",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Neri" })
        )
        const { customer, contact } = yield* contactOf(operator)
        const requestId = crypto.randomUUID()

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          requestId,
          source: "list",
        })

        const [row] = yield* callsOf(customer.id)
        expect(row).toMatchObject({
          taskId: contact.id,
          customerId: customer.id,
          actorOperatorId: operator.id,
          action: "call",
          source: "list",
          outcome: "non risponde",
          origin: "list",
          fromState: "chiamare",
          toState: "non risponde",
          requestId,
          alertId: null,
          createdAt: NOW,
        })
        expect(result).toEqual({
          taskId: contact.id,
          state: "non risponde",
          alert: null,
          call: {
            id: row!.id,
            outcome: "non risponde",
            origin: "list",
            at: NOW,
            by: "Ada Neri",
          },
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "non risponde",
          closedAt: NOW,
          alertId: null,
        })
      })
  )

  it.effect(
    "Non risponde con un alert futuro: resta Richiamo e l'alert resta aperto, senza conferma",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "richiamare",
          FUTURE
        )

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          workingAlertId: open!.id,
        })

        expect(result.state).toBe("richiamare")
        expect(result.alert).toEqual({
          id: open!.id,
          deadline: FUTURE,
          day: "2026-11-10",
          message: "Richiamare dopo le 18",
        })
        expect(yield* alertRow(open!.id)).toMatchObject({ isResolved: false })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "richiamare",
          alertId: open!.id,
          closedAt: NOW,
        })
        expect(yield* callsOf(customer.id)).toMatchObject([
          { outcome: "non risponde", toState: "richiamare", origin: "list" },
        ])
      })
  )

  it.effect(
    "Non risponde con un alert di oggi non ancora lavorato: Non risponde, l'alert resta aperto, origine alert",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "richiamare",
          DUE_TODAY
        )

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          workingAlertId: open!.id,
        })

        expect(result.state).toBe("non risponde")
        expect(result.alert?.id).toBe(open!.id)
        expect(yield* alertRow(open!.id)).toMatchObject({ isResolved: false })
        expect(yield* callsOf(customer.id)).toMatchObject([
          {
            outcome: "non risponde",
            fromState: "richiamare",
            toState: "non risponde",
            origin: "alert",
          },
        ])
      })
  )

  it.effect(
    "Richiamare sull'alert futuro confermato: lo chiude con resolution call e ne apre uno nuovo col giorno e il messaggio",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "richiamare",
          FUTURE
        )

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "richiamare",
          workingAlertId: open!.id,
          confirmedAlertId: open!.id,
          callback: { day: "2026-11-20", message: "  Dopo pranzo  " },
        })

        expect(yield* alertRow(open!.id)).toMatchObject({
          isResolved: true,
          resolvedBy: operator.id,
          resolvedAt: NOW,
          resolution: "call",
        })
        const created = yield* alertRow(result.alert!.id)
        expect(created).toMatchObject({
          taskId: contact.id,
          message: "Dopo pranzo",
          isResolved: false,
        })
        expect(result).toMatchObject({
          state: "richiamare",
          alert: { id: created.id, day: "2026-11-20", message: "Dopo pranzo" },
          call: { outcome: "richiamare", origin: "list" },
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "richiamare",
          alertId: created.id,
          closedAt: NOW,
        })
        expect(yield* callsOf(customer.id)).toMatchObject([
          {
            outcome: "richiamare",
            fromState: "richiamare",
            toState: "richiamare",
            alertId: created.id,
          },
        ])
      })
  )

  it.effect(
    "Richiamare da Da chiamare senza messaggio: un messaggio di soli spazi vale come assente",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { contact } = yield* contactOf(operator)

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "richiamare",
          callback: { day: "2026-11-03", message: "   " },
        })

        expect(result.alert).toMatchObject({ day: "2026-11-03", message: null })
        expect((yield* alertRow(result.alert!.id)).message).toBeNull()
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "richiamare",
        })
      })
  )

  it.effect(
    "Appuntamento con un alert scaduto: lo chiude senza conferma, origine alert",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "non risponde",
          EXPIRED
        )

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "app.to",
          workingAlertId: open!.id,
        })

        expect(result).toMatchObject({ state: "app.to", alert: null })
        expect(yield* alertRow(open!.id)).toMatchObject({
          isResolved: true,
          resolution: "call",
          resolvedAt: NOW,
        })
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "app.to",
          alertId: null,
          closedAt: NOW,
        })
        expect(yield* callsOf(customer.id)).toMatchObject([
          { outcome: "app.to", toState: "app.to", origin: "alert" },
        ])
      })
  )

  it.effect(
    "Non interessato da un admin su un contatto non suo: Non interessato, la chiamata è dell'admin",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const { customer, contact } = yield* contactOf(operator)

        const result = yield* press(
          admin,
          { taskId: contact.id, outcome: "non interessato" },
          "ADMIN"
        )

        expect(result.state).toBe("non interessato")
        expect(yield* taskRow(contact.id)).toMatchObject({
          state: "non interessato",
          operatorId: operator.id,
          isActive: true,
        })
        expect(yield* callsOf(customer.id)).toMatchObject([
          { outcome: "non interessato", actorOperatorId: admin.id },
        ])
      })
  )
})

describe("registerCall: rifiuti nell'ordine di AC13", () => {
  it.effect("caso 2: il contatto non esiste", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())

      const error = yield* Effect.flip(
        press(operator, { taskId: 999_999, outcome: "app.to" })
      )

      expect(error).toEqual(new ContactNotFound())
    })
  )

  it.effect(
    "caso 3: il contatto è sostituito, e vince sul messaggio di 501 caratteri",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const old = yield* given(() =>
          createTask({
            customerId: customer.id,
            operatorId: operator.id,
            isActive: false,
          })
        )
        const active = yield* given(() =>
          createTask({ customerId: customer.id, operatorId: operator.id })
        )
        const before = yield* snapshot(customer.id)

        const error = yield* Effect.flip(
          press(operator, {
            taskId: old.id,
            outcome: "richiamare",
            callback: { day: TODAY, message: "x".repeat(501) },
          })
        )

        expect(error).toEqual(
          new ContactSuperseded({ activeTaskId: active.id })
        )
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect("caso 4: l'utente non può più modificare il contatto", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const owner = yield* given(() =>
        createOperator({ name: "Bruno", surname: "Verdi" })
      )
      const other = yield* given(() => createOperator())
      const { customer, contact } = yield* contactOf(owner)
      const before = yield* snapshot(customer.id)

      const error = yield* Effect.flip(
        press(other, { taskId: contact.id, outcome: "non risponde" })
      )

      expect(error).toEqual(new ContactForbidden({ assignee: "Bruno Verdi" }))
      expect(yield* snapshot(customer.id)).toEqual(before)
    })
  )

  it.effect(
    "caso 5: l'alert lavorato è già chiuso da una chiamata, e vince sui casi 6 e 7",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const colleague = yield* given(() =>
          createOperator({ name: "Carla", surname: "Bianchi" })
        )
        const workedAt = new Date("2026-11-02T08:15:00.000Z")
        // Case 6: the colleague's call left the contact in Appuntamento
        const closed = yield* contactOf(operator, "app.to")
        const worked = yield* given(() =>
          createAlert({
            taskId: closed.contact.id,
            deadline: DUE_TODAY,
            isResolved: true,
            resolvedBy: colleague.id,
            resolvedAt: workedAt,
            resolution: "call",
          })
        )
        // Case 7: the colleague's Richiamare opened a future alert
        const again = yield* contactOf(operator, "richiamare", FUTURE)
        const workedBefore = yield* given(() =>
          createAlert({
            taskId: again.contact.id,
            deadline: DUE_TODAY,
            isResolved: true,
            resolvedBy: colleague.id,
            resolvedAt: workedAt,
            resolution: "call",
          })
        )
        // `createAlert` links the alert to the task: give it back the open one
        yield* given(() =>
          testDb
            .update(task)
            .set({ alertId: null })
            .where(eq(task.id, closed.contact.id))
        )
        yield* given(() =>
          testDb
            .update(task)
            .set({ alertId: again.open!.id })
            .where(eq(task.id, again.contact.id))
        )
        const before = yield* snapshot(again.customer.id)

        const onClosed = yield* Effect.flip(
          press(operator, {
            taskId: closed.contact.id,
            outcome: "non interessato",
            workingAlertId: worked.id,
          })
        )
        const onAgain = yield* Effect.flip(
          press(operator, {
            taskId: again.contact.id,
            outcome: "app.to",
            workingAlertId: workedBefore.id,
          })
        )

        const expected = new CallAlreadyWorked({
          by: "Carla Bianchi",
          at: workedAt,
        })
        expect(onClosed).toEqual(expected)
        expect(onAgain).toEqual(expected)
        expect(yield* snapshot(again.customer.id)).toEqual(before)
      })
  )

  it.effect(
    "caso 5 non vale per un alert chiuso in un altro modo: la chiamata prosegue",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator)
        const removed = yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: DUE_TODAY,
            isResolved: true,
            resolvedBy: operator.id,
            resolvedAt: NOW,
            resolution: "removed",
          })
        )
        yield* given(() =>
          testDb
            .update(task)
            .set({ alertId: null })
            .where(eq(task.id, contact.id))
        )

        const result = yield* press(operator, {
          taskId: contact.id,
          outcome: "app.to",
          workingAlertId: removed.id,
        })

        expect(result.state).toBe("app.to")
        expect(yield* callsOf(customer.id)).toMatchObject([
          { outcome: "app.to", origin: "list" },
        ])
      })
  )

  it.effect.each(["app.to", "caricato", "non interessato"] as const)(
    "caso 6: lo stato %s non ammette chiamate",
    (state) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator, state)
        const before = yield* snapshot(customer.id)

        const error = yield* Effect.flip(
          press(operator, { taskId: contact.id, outcome: "non risponde" })
        )

        expect(error).toEqual(new CallNotAllowed({ state }))
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect(
    "caso 7: Richiamare, Appuntamento o Non interessato su un alert futuro non confermato",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "richiamare",
          FUTURE
        )
        const before = yield* snapshot(customer.id)
        const expected = new AlertConfirmationRequired({
          alert: {
            id: open!.id,
            deadline: FUTURE,
            message: "Richiamare dopo le 18",
          },
        })

        for (const input of [
          { outcome: "app.to" as const },
          { outcome: "non interessato" as const, confirmedAlertId: 1 },
          {
            outcome: "richiamare" as const,
            callback: { day: "2026-11-20", message: null },
          },
        ]) {
          const error = yield* Effect.flip(
            press(operator, {
              taskId: contact.id,
              workingAlertId: open!.id,
              ...input,
            })
          )
          expect(error).toEqual(expected)
        }
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect(
    "caso 8: Richiamare per oggi, e vince sul messaggio troppo lungo",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator)
        const before = yield* snapshot(customer.id)

        const error = yield* Effect.flip(
          press(operator, {
            taskId: contact.id,
            outcome: "richiamare",
            callback: { day: TODAY, message: "x".repeat(501) },
          })
        )

        expect(error).toEqual(new DeadlineInPast())
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect("caso 9: un messaggio oltre 500 caratteri; 500 passano", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const { customer, contact } = yield* contactOf(operator)
      const before = yield* snapshot(customer.id)

      const error = yield* Effect.flip(
        press(operator, {
          taskId: contact.id,
          outcome: "richiamare",
          callback: { day: "2026-11-03", message: "x".repeat(501) },
        })
      )
      expect(error).toEqual(new MessageTooLong())
      expect(yield* snapshot(customer.id)).toEqual(before)

      const saved = yield* press(operator, {
        taskId: contact.id,
        outcome: "richiamare",
        callback: { day: "2026-11-03", message: "x".repeat(500) },
      })
      expect(saved.alert?.message).toHaveLength(500)
    })
  )
})

describe("registerCall: lo stesso invio (AC11, D5)", () => {
  it.effect(
    "una ripetizione dopo che il contatto è cambiato riceve la stessa risposta, senza ricontrollare né scrivere",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator)
        const requestId = crypto.randomUUID()
        const input = {
          taskId: contact.id,
          outcome: "richiamare" as const,
          callback: { day: "2026-11-05", message: "Sera" },
          requestId,
        }

        const first = yield* press(operator, input)
        const after = yield* snapshot(customer.id)
        // Later: the contact is in Richiamo with a future alert, so a new
        // press without confirmation would be rejected (case 7)
        yield* TestClock.setTime(NOW.getTime() + 60_000)
        const again = yield* press(operator, input)

        expect(again).toEqual(first)
        expect(yield* snapshot(customer.id)).toEqual(after)
      })
  )

  it.effect(
    "lo stesso requestId da un altro utente, o su un altro contatto, è RequestIdConflict",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const { contact } = yield* contactOf(operator)
        const other = yield* contactOf(operator)
        const requestId = crypto.randomUUID()

        yield* press(operator, {
          taskId: contact.id,
          outcome: "non risponde",
          requestId,
        })
        const before = yield* snapshot(other.customer.id)

        const byAdmin = yield* Effect.flip(
          press(
            admin,
            { taskId: contact.id, outcome: "non risponde", requestId },
            "ADMIN"
          )
        )
        const onOther = yield* Effect.flip(
          press(operator, {
            taskId: other.contact.id,
            outcome: "non risponde",
            requestId,
          })
        )

        expect(byAdmin).toEqual(new RequestIdConflict())
        expect(onOther).toEqual(new RequestIdConflict())
        expect(yield* snapshot(other.customer.id)).toEqual(before)
      })
  )
})
