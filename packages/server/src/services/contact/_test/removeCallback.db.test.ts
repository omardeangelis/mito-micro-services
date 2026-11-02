import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { asc, eq } from "drizzle-orm"
import { type Role } from "@mito/domain/contact/permissions"
import { removeCallbackTargets } from "@mito/domain/contact/status"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
import {
  CallbackChanged,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  TransitionRejected,
} from "../errors"
import { removeCallback } from "../removeCallback"
import { customerRow, logOf, migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// The server's instant of every removal: 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const FUTURE = new Date("2026-11-10T08:00:00.000Z")
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")
const CLOSED_AT = new Date("2026-10-01T08:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

type Operator = Awaited<ReturnType<typeof createOperator>>

const actorOf = (operator: { id: number }, role: Role = "OPERATORE") => ({
  operatorId: operator.id,
  role,
})

/** A customer of `operator` with their contact in Richiamo and an open alert. */
const callbackOf = (operator: Operator, state: TaskStatus = "richiamare") =>
  given(async () => {
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: LONG_AGO,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state,
      closedAt: CLOSED_AT,
    })
    const open = await createAlert({
      taskId: contact.id,
      deadline: FUTURE,
      message: "Richiamare dopo le 18",
    })
    return { customer, contact, open }
  })

const remove = (
  operator: Operator,
  input: { taskId: number; alertId: number; state: TaskStatus },
  role: Role = "OPERATORE"
) =>
  removeCallback({ ...input, actor: actorOf(operator, role) }).pipe(
    provideServer
  )

const tasksOf = (customerId: string) =>
  given(() =>
    testDb
      .select()
      .from(task)
      .where(eq(task.customerId, customerId))
      .orderBy(asc(task.id))
  )

const alertRow = (id: number) =>
  given(() =>
    testDb
      .select()
      .from(alert)
      .where(eq(alert.id, id))
      .then(([row]) => row!)
  )

/** Everything a removal may write, for one customer. */
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

describe("removeCallback: Togli il richiamo (AC21, AC22)", () => {
  it.effect(
    "con Appuntamento chiude l'alert con resolution removed, tiene lo stesso task.id e non scrive chiamate",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(operator)

        const result = yield* remove(operator, {
          taskId: contact.id,
          alertId: open.id,
          state: "app.to",
        })

        expect(result).toEqual({ taskId: contact.id, state: "app.to" })
        expect(yield* alertRow(open.id)).toMatchObject({
          isResolved: true,
          resolvedBy: operator.id,
          resolvedAt: NOW,
          resolution: "removed",
        })
        const [after] = yield* tasksOf(customer.id)
        expect(after).toMatchObject({
          id: contact.id,
          state: "app.to",
          alertId: null,
          isActive: true,
          operatorId: operator.id,
          closedAt: CLOSED_AT,
        })
        const log = yield* given(() => logOf(customer.id))
        expect(log.filter(({ action }) => action === "call")).toEqual([])
        expect(log).toMatchObject([
          { action: "alert_resolved", source: "detail", alertId: open.id },
          {
            action: "state_change",
            source: "detail",
            taskId: contact.id,
            fromState: "richiamare",
            toState: "app.to",
            actorOperatorId: operator.id,
          },
        ])
      })
  )

  it.effect.each(removeCallbackTargets)(
    "con %s: lo stesso contatto, l'alert chiuso, «Contattato il» com'era",
    (state) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(operator)

        yield* remove(operator, {
          taskId: contact.id,
          alertId: open.id,
          state,
        })

        expect(yield* alertRow(open.id)).toMatchObject({
          isResolved: true,
          resolution: "removed",
        })
        expect(yield* tasksOf(customer.id)).toMatchObject([
          {
            id: contact.id,
            state,
            alertId: null,
            isActive: true,
            closedAt: CLOSED_AT,
          },
        ])
        const log = yield* given(() => logOf(customer.id))
        expect(log.map(({ action }) => action)).toEqual([
          "alert_resolved",
          "state_change",
        ])
      })
  )

  it.effect(
    "lo stesso stato di prima, Non risponde da un Non risponde: chiude l'alert e non scrive state_change",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(
          operator,
          "non risponde"
        )

        yield* remove(operator, {
          taskId: contact.id,
          alertId: open.id,
          state: "non risponde",
        })

        expect(yield* alertRow(open.id)).toMatchObject({
          resolution: "removed",
        })
        expect(yield* tasksOf(customer.id)).toMatchObject([
          { id: contact.id, state: "non risponde", alertId: null },
        ])
        const log = yield* given(() => logOf(customer.id))
        expect(log.map(({ action }) => action)).toEqual(["alert_resolved"])
      })
  )

  it.effect("un alert già chiuso: CallbackChanged e non cambia nulla", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const { customer, contact, open } = yield* callbackOf(operator)
      // Closed meanwhile by a call of someone else
      yield* given(async () => {
        await testDb
          .update(alert)
          .set({ isResolved: true, resolution: "call" })
          .where(eq(alert.id, open.id))
        await testDb
          .update(task)
          .set({ alertId: null })
          .where(eq(task.id, contact.id))
      })
      const before = yield* snapshot(customer.id)

      const error = yield* remove(operator, {
        taskId: contact.id,
        alertId: open.id,
        state: "app.to",
      }).pipe(Effect.flip)

      expect(error).toBeInstanceOf(CallbackChanged)
      expect(yield* snapshot(customer.id)).toEqual(before)
    })
  )

  it.effect(
    "un alert che non è più quello collegato al contatto: CallbackChanged e non cambia nulla",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(operator)
        // Replaced meanwhile: the contact now points at a newer alert
        yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: FUTURE,
            message: "Nuovo",
          })
        )
        const before = yield* snapshot(customer.id)

        const error = yield* remove(operator, {
          taskId: contact.id,
          alertId: open.id,
          state: "app.to",
        }).pipe(Effect.flip)

        expect(error).toBeInstanceOf(CallbackChanged)
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect.each(["richiamare", "followup", "erogata", "nessuno"] as const)(
    "lo stato %s non è tra le scelte: TransitionRejected e non cambia nulla",
    (state) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(operator)
        const before = yield* snapshot(customer.id)

        const error = yield* remove(operator, {
          taskId: contact.id,
          alertId: open.id,
          state,
        }).pipe(Effect.flip)

        expect(error).toEqual(
          new TransitionRejected({ from: "richiamare", to: state })
        )
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect(
    "i casi del guard: contatto inesistente, sostituito, di un altro operatore",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const stranger = yield* given(() => createOperator())
        const { customer, contact, open } = yield* callbackOf(operator)
        const input = {
          taskId: contact.id,
          alertId: open.id,
          state: "app.to",
        } as const

        const missing = yield* remove(operator, {
          ...input,
          taskId: 999_999,
        }).pipe(Effect.flip)
        const forbidden = yield* remove(stranger, input).pipe(Effect.flip)
        expect(missing).toBeInstanceOf(ContactNotFound)
        expect(forbidden).toBeInstanceOf(ContactForbidden)

        yield* given(() =>
          testDb
            .update(task)
            .set({ isActive: false })
            .where(eq(task.id, contact.id))
        )
        const before = yield* snapshot(customer.id)
        const superseded = yield* remove(operator, input).pipe(Effect.flip)
        expect(superseded).toBeInstanceOf(ContactSuperseded)
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )
})
