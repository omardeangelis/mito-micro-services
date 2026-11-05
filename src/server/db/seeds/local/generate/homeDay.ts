// The day of the two operators the home of spec home-operatore is tried with
// (T14), on top of the dataset the other steps made. It only reassigns rows
// that exist, so what `contacts.test.ts` checks still holds:
//
//   FULL_DAY_OPERATOR_ID     at least `FULL_DAY.today` open alerts due on D
//                            (overdue ones it already has) and at least
//                            `FULL_DAY.calls` calls on D
//   TYPICAL_DAY_OPERATOR_ID  exactly `TYPICAL_DAY.calls` calls on D; its
//                            alerts stay as the shares made them
//
// A contact passes to the full-day operator with its customer (the active task
// has the customer's operator, AC19), and one of the full-day operator's goes
// the other way, so the shares of AC18 hold: only an active contact with an open alert
// due on D, no `operator_reassign` in its log, and an operator that is a
// plain OPERATORE, not the inactive one of the Waves. A call passes with the
// alert it closed (`resolvedBy`) and the `alert_resolved` row beside it, only
// the actor changes. Pure and seeded.
import { romeDay } from "../day"
import type {
  AlertRow,
  CustomerRow,
  Day,
  OperatorRow,
  TaskEventLogRow,
  TaskRow,
} from "../types"
import {
  ADMIN_COUNT,
  EMPTY_OPERATOR_ID,
  FULL_DAY_OPERATOR_ID,
  SYSTEM_OPERATOR_ID,
  TYPICAL_DAY_OPERATOR_ID,
} from "./operators"
import { createRandom } from "./random"
import { INACTIVE_OPERATOR_ID } from "./waves"

/** The volumes of the full day (spec Volumi: 64 overdue + 192 today, 57 calls). */
export const FULL_DAY = { overdue: 64, today: 192, calls: 57 } as const
/** The typical day: 23 calls, about ten alerts it already has. */
export const TYPICAL_DAY = { calls: 23 } as const

type Rows = {
  customers: CustomerRow[]
  alerts: AlertRow[]
  tasks: TaskRow[]
  taskEventLog: TaskEventLogRow[]
}

export function shapeOperatorDay({
  day,
  operators,
  customers,
  alerts,
  tasks,
  taskEventLog,
}: Rows & { day: Day; operators: readonly OperatorRow[] }): Rows {
  const rng = createRandom("home-day")
  const adminIds = new Set(operators.slice(0, ADMIN_COUNT).map((o) => o.id))
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]))
  const customerIndex = new Map(customers.map((c, i) => [c.id, i]))
  const reassigned = new Set(
    taskEventLog
      .filter((row) => row.action === "operator_reassign")
      .map((row) => row.taskId)
  )

  // Alerts due on D: the active contacts with an open one, by operator
  const dueToday = (task: TaskRow) => {
    const alert = task.alertId == null ? undefined : alertById.get(task.alertId)
    return (
      task.isActive === true &&
      alert !== undefined &&
      !alert.isResolved &&
      romeDay(alert.deadline) === day
    )
  }
  const todayOf = (operatorId: number) =>
    tasks.filter((t) => t.operatorId === operatorId && dueToday(t)).length

  const newTasks = [...tasks]
  const newCustomers = [...customers]
  const need = FULL_DAY.today - todayOf(FULL_DAY_OPERATOR_ID)
  if (need > 0) {
    const donors = rng.shuffle(
      tasks.filter(
        (t) =>
          dueToday(t) &&
          t.operatorId != null &&
          t.operatorId !== FULL_DAY_OPERATOR_ID &&
          t.operatorId !== TYPICAL_DAY_OPERATOR_ID &&
          t.operatorId !== INACTIVE_OPERATOR_ID &&
          t.operatorId !== EMPTY_OPERATOR_ID &&
          t.operatorId !== SYSTEM_OPERATOR_ID &&
          !adminIds.has(t.operatorId) &&
          !reassigned.has(t.id) &&
          customerIndex.has(t.customerId!)
      )
    )
    // Swap, not move: the contact goes to the full-day operator and one of its
    // own, with no alert due by D, goes to the donor's operator, so the
    // shares of customers and the loads of AC18 stay as they were
    const dueByToday = (task: TaskRow) => {
      const alert =
        task.alertId == null ? undefined : alertById.get(task.alertId)
      return (
        alert !== undefined &&
        !alert.isResolved &&
        romeDay(alert.deadline) <= day
      )
    }
    const returns = rng.shuffle(
      tasks.filter(
        (t) =>
          t.isActive === true &&
          t.operatorId === FULL_DAY_OPERATOR_ID &&
          !dueByToday(t) &&
          !reassigned.has(t.id) &&
          customerIndex.has(t.customerId!)
      )
    )
    const taskIndex = new Map(tasks.map((t, i) => [t.id, i]))
    const swapped = (task: TaskRow, operatorId: number) => {
      newTasks[taskIndex.get(task.id)!] = { ...task, operatorId }
      const i = customerIndex.get(task.customerId!)!
      newCustomers[i] = { ...newCustomers[i]!, operatorId }
    }
    donors.slice(0, Math.min(need, returns.length)).forEach((task, k) => {
      const back = returns[k]!
      swapped(back, task.operatorId!)
      swapped(task, FULL_DAY_OPERATOR_ID)
    })
  }

  // Calls on D: the full day at least, the typical day exactly
  const isTodayCall = (row: TaskEventLogRow) =>
    row.action === "call" && romeDay(row.createdAt!) === day
  const callsOf = (operatorId: number) =>
    taskEventLog.filter(
      (row) => isTodayCall(row) && row.actorOperatorId === operatorId
    ).length
  const moves = new Map<number, number>() // log row id -> new actor
  const takeCalls = (operatorId: number, count: number) => {
    const donors = rng
      .shuffle(
        taskEventLog.filter(
          (row) =>
            isTodayCall(row) &&
            row.actorOperatorId !== FULL_DAY_OPERATOR_ID &&
            row.actorOperatorId !== TYPICAL_DAY_OPERATOR_ID &&
            !moves.has(row.id)
        )
      )
      .slice(0, Math.max(0, count))
    for (const row of donors) moves.set(row.id, operatorId)
  }
  takeCalls(
    FULL_DAY_OPERATOR_ID,
    FULL_DAY.calls - callsOf(FULL_DAY_OPERATOR_ID)
  )
  takeCalls(
    TYPICAL_DAY_OPERATOR_ID,
    TYPICAL_DAY.calls - callsOf(TYPICAL_DAY_OPERATOR_ID)
  )

  // The alert a moved call closed, and the `alert_resolved` rows of that
  // alert, follow it: the resolver is the one who called
  const movedCalls = taskEventLog.filter((row) => moves.has(row.id))
  const resolvedBy = new Map<number, number>() // alert id -> new resolver
  for (const alert of alerts) {
    if (!alert.isResolved || alert.resolution !== "call") continue
    const call = movedCalls.find(
      (row) =>
        row.taskId === alert.taskId &&
        alert.resolvedBy === row.actorOperatorId &&
        alert.resolvedAt?.getTime() === row.createdAt!.getTime()
    )
    if (call) resolvedBy.set(alert.id, moves.get(call.id)!)
  }
  const newAlerts = alerts.map((alert) =>
    resolvedBy.has(alert.id)
      ? { ...alert, resolvedBy: resolvedBy.get(alert.id)! }
      : alert
  )
  const newLog = taskEventLog.map((row) => {
    const actor =
      moves.get(row.id) ??
      (row.action === "alert_resolved" && row.alertId != null
        ? resolvedBy.get(row.alertId)
        : undefined)
    return actor === undefined ? row : { ...row, actorOperatorId: actor }
  })

  return {
    customers: newCustomers,
    alerts: newAlerts,
    tasks: newTasks,
    taskEventLog: newLog,
  }
}
