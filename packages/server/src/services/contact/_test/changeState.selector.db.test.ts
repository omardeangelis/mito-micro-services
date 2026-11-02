import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { asc, eq } from "drizzle-orm"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
import { changeState } from "../changeState"
import { AlertConfirmationRequired, TransitionRejected } from "../errors"
import { customerRow, logOf, migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const FUTURE = new Date("2026-11-10T08:00:00.000Z")
const DUE_TODAY = new Date("2026-11-02T07:00:00.000Z")
const EXPIRED = new Date("2026-10-28T08:00:00.000Z")
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")
const CLOSED_AT = new Date("2026-10-01T08:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

type Operator = Awaited<ReturnType<typeof createOperator>>

const contactOf = (operator: Operator, state: TaskStatus, alertAt?: Date) =>
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
    const open = alertAt
      ? await createAlert({ taskId: contact.id, deadline: alertAt })
      : null
    return { customer, contact, open }
  })

const select = (
  operator: Operator,
  input: {
    taskId: number
    toState: TaskStatus
    confirmedAlertId?: number | null
  }
) =>
  changeState({
    source: "detail",
    confirmedAlertId: null,
    ...input,
    actor: { operatorId: operator.id, role: "OPERATORE" },
  }).pipe(provideServer)

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

describe("changeState: il selettore (AC17)", () => {
  it.effect(
    "Pratica caricata con un alert scaduto lo chiude senza conferma, con resolution state_change, e non è una chiamata",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact, open } = yield* contactOf(
          operator,
          "richiamare",
          EXPIRED
        )

        const result = yield* select(operator, {
          taskId: contact.id,
          toState: "caricato",
        })

        expect(result).toEqual({ taskId: contact.id, reopened: false })
        expect(yield* snapshot(customer.id)).toMatchObject({
          tasks: [
            {
              id: contact.id,
              state: "caricato",
              alertId: null,
              closedAt: CLOSED_AT,
            },
          ],
          alerts: [
            {
              id: open!.id,
              isResolved: true,
              resolvedBy: operator.id,
              resolvedAt: NOW,
              resolution: "state_change",
            },
          ],
        })
        const log = yield* given(() => logOf(customer.id))
        expect(log.map(({ action }) => action)).toEqual([
          "alert_resolved",
          "state_change",
        ])
      })
  )

  it.effect(
    "Pratica caricata con un alert di oggi lo chiude senza conferma",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { contact, open } = yield* contactOf(
          operator,
          "richiamare",
          DUE_TODAY
        )

        yield* select(operator, { taskId: contact.id, toState: "caricato" })

        expect(
          yield* given(() =>
            testDb.select().from(alert).where(eq(alert.id, open!.id))
          )
        ).toMatchObject([{ isResolved: true, resolution: "state_change" }])
      })
  )

  it.effect(
    "Pratica caricata con un alert futuro chiede la conferma e non cambia nulla; confermato lo chiude",
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

        const error = yield* select(operator, {
          taskId: contact.id,
          toState: "caricato",
        }).pipe(Effect.flip)

        expect(error).toBeInstanceOf(AlertConfirmationRequired)
        expect(yield* snapshot(customer.id)).toEqual(before)

        yield* select(operator, {
          taskId: contact.id,
          toState: "caricato",
          confirmedAlertId: open!.id,
        })
        expect(yield* snapshot(customer.id)).toMatchObject({
          tasks: [{ state: "caricato", alertId: null }],
          alerts: [{ isResolved: true, resolution: "state_change" }],
        })
      })
  )

  it.effect.each([
    ["chiamare", "richiamare"],
    ["chiamare", "app.to"],
    ["chiamare", "non interessato"],
    ["chiamare", "non risponde"],
    ["richiamare", "non risponde"],
    ["richiamare", "chiamare"],
    ["non risponde", "chiamare"],
    ["app.to", "non interessato"],
    ["chiamare", "followup"],
  ] as const)(
    "da %s a %s non è del selettore: TransitionRejected e non cambia nulla",
    ([from, to]) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator, from)
        const before = yield* snapshot(customer.id)

        const error = yield* select(operator, {
          taskId: contact.id,
          toState: to,
        }).pipe(Effect.flip)

        expect(error).toEqual(new TransitionRejected({ from, to }))
        expect(yield* snapshot(customer.id)).toEqual(before)
      })
  )

  it.effect(
    "Da chiamare da Appuntamento riapre: un contatto nuovo, «Contattato il» ereditato, nessuna chiamata",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const operator = yield* given(() => createOperator())
        const { customer, contact } = yield* contactOf(operator, "app.to")

        const result = yield* select(operator, {
          taskId: contact.id,
          toState: "chiamare",
        })

        expect(result.reopened).toBe(true)
        expect(result.taskId).not.toBe(contact.id)
        const tasks = yield* given(() =>
          testDb
            .select()
            .from(task)
            .where(eq(task.customerId, customer.id))
            .orderBy(asc(task.id))
        )
        expect(tasks).toMatchObject([
          { id: contact.id, isActive: false, state: "app.to" },
          {
            id: result.taskId,
            isActive: true,
            state: "chiamare",
            closedAt: CLOSED_AT,
          },
        ])
        const log = yield* given(() => logOf(customer.id))
        expect(log.map(({ action }) => action)).toEqual(["state_change"])
      })
  )
})
