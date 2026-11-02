import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { alert } from "@mito/db/schema/task"
import { bulkHandleTask } from "../bulkHandleTask"
import { changeState } from "../changeState"
import { processDueAlerts } from "../processDueAlerts"
import { resolveAlert } from "../resolveAlert"
import { setCallback } from "../setCallback"
import { logOf, migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// The clock of the closing: `resolved_at` must be this instant (AC21, AC23)
const CLOSED_AT = new Date("2026-10-30T09:00:00.000Z")
const FAR_FUTURE = new Date("2030-01-10T22:00:00.000Z")
const EARLIER_DAY = new Date("2026-09-20T08:00:00.000Z")
const NOW = new Date("2026-09-25T06:00:00.000Z")

const actorOf = (operator: { id: number }) => ({
  operatorId: operator.id,
  role: "OPERATORE" as const,
})

/** The closing columns of one alert. */
const closingOf = async (alertId: number) => {
  const [row] = await testDb
    .select({
      isResolved: alert.isResolved,
      resolvedBy: alert.resolvedBy,
      resolvedAt: alert.resolvedAt,
      resolution: alert.resolution,
    })
    .from(alert)
    .where(eq(alert.id, alertId))
  return row!
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  await createSystemOperator()
})

describe("chiusura dell'alert: resolution e resolved_at", () => {
  it.effect("la 'X' scrive resolution = removed e resolved_at dal Clock", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(CLOSED_AT.getTime())
      const operator = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: operator.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const open = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: EARLIER_DAY })
      )

      yield* resolveAlert({
        alertId: open.id,
        actor: actorOf(operator),
        source: "detail",
      }).pipe(provideServer)

      expect(yield* Effect.promise(() => closingOf(open.id))).toEqual({
        isResolved: true,
        resolvedBy: operator.id,
        resolvedAt: CLOSED_AT,
        resolution: "removed",
      })
    })
  )

  it.effect("setCallback che sostituisce l'alert scrive resolution = replaced", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(CLOSED_AT.getTime())
      const operator = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: operator.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const replaced = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: FAR_FUTURE })
      )

      yield* setCallback({
        taskId: contact.id,
        deadline: FAR_FUTURE,
        message: null,
        replacesAlertId: replaced.id,
        actor: actorOf(operator),
      }).pipe(provideServer)

      expect(yield* Effect.promise(() => closingOf(replaced.id))).toMatchObject({
        isResolved: true,
        resolvedAt: CLOSED_AT,
        resolution: "replaced",
      })
    })
  )

  it.effect("changeState che chiude l'alert confermato scrive resolution = state_change", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(CLOSED_AT.getTime())
      const operator = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: operator.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const open = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: FAR_FUTURE })
      )

      yield* changeState({
        taskId: contact.id,
        toState: "caricato",
        source: "detail",
        confirmedAlertId: open.id,
        actor: actorOf(operator),
      }).pipe(provideServer)

      expect(yield* Effect.promise(() => closingOf(open.id))).toMatchObject({
        isResolved: true,
        resolvedAt: CLOSED_AT,
        resolution: "state_change",
      })
    })
  )

  it.effect("l'assegnazione massiva che chiude l'alert scrive resolution = bulk e la sua riga di log", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(CLOSED_AT.getTime())
      const operator = yield* Effect.promise(() => createOperator())
      const target = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: operator.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const open = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: FAR_FUTURE })
      )

      yield* bulkHandleTask({
        operatorId: target.id,
        customerIds: [customer.id],
        state: "chiamare",
        resolveAlertCustomerIds: [customer.id],
        actorOperatorId: operator.id,
      }).pipe(provideServer)

      expect(yield* Effect.promise(() => closingOf(open.id))).toMatchObject({
        isResolved: true,
        resolvedBy: operator.id,
        resolvedAt: CLOSED_AT,
        resolution: "bulk",
      })
      expect(yield* Effect.promise(() => logOf(customer.id))).toContainEqual(
        expect.objectContaining({
          action: "alert_resolved",
          source: "bulk",
          alertId: open.id,
          taskId: contact.id,
          actorOperatorId: operator.id,
        })
      )
    })
  )

  it.effect("il passaggio notturno che chiude l'alert scaduto scrive resolution = system", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(CLOSED_AT.getTime())
      const operator = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: operator.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const due = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: EARLIER_DAY })
      )

      yield* processDueAlerts(NOW, { budgetMs: 60_000 }).pipe(provideServer)

      expect(yield* Effect.promise(() => closingOf(due.id))).toMatchObject({
        isResolved: true,
        resolvedAt: CLOSED_AT,
        resolution: "system",
      })
    })
  )
})
