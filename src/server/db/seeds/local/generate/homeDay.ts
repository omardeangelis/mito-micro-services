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
//
// `addTeamCalls` (T13) adds the calls of today and of yesterday across the
// working hours, of the other operators: a call that keeps the contact in its
// state, with no open alert, so the manifest's scenarios still hold.
import { romeAt } from "@mito/domain/contact/time"
import { addDays, romeDay } from "../day"
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
import { LOG_ID_START } from "./log"
import { createRandom, range } from "./random"
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

/** Calls per Rome hour, on D and on the day before (T13). */
const TEAM_CALLS_PER_HOUR: ReadonlyArray<
  readonly [hour: number, calls: number]
> = [
  [7, 2],
  [8, 3],
  [9, 3],
  [10, 3],
  [11, 3],
  [12, 3],
  [13, 2],
  [14, 3],
  [15, 3],
  [16, 3],
  [17, 3],
  [18, 3],
  [19, 2],
  [20, 1],
]

/** The states a call keeps: the outcome is the state, and no alert is open. */
const STATE_KEEPING = ["non risponde", "app.to", "non interessato"] as const
type KeepingState = (typeof STATE_KEEPING)[number]
const isKeeping = (state: string | null | undefined): state is KeepingState =>
  (STATE_KEEPING as readonly string[]).includes(state ?? "")

/**
 * The calls of the team on D and on the day before, across the working hours
 * (T13). Each one is a `call` row on an active contact of another operator
 * that has no open alert and is in `non risponde`, `app.to` or
 * `non interessato`: the outcome is the state, so the contact does not move
 * and the scenarios of the manifest hold. Only `closedAt` moves to the call,
 * as AC29 asks. The log is renumbered in time order. Pure and seeded.
 */
export function addTeamCalls({
  day,
  tasks,
  alerts,
  taskEventLog,
}: Pick<Rows, "tasks" | "alerts" | "taskEventLog"> & { day: Day }): Pick<
  Rows,
  "tasks" | "taskEventLog"
> {
  const rng = createRandom("home-calls")
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]))
  const excluded = new Set<number>([
    FULL_DAY_OPERATOR_ID,
    TYPICAL_DAY_OPERATOR_ID,
    INACTIVE_OPERATOR_ID,
    EMPTY_OPERATOR_ID,
    SYSTEM_OPERATOR_ID,
  ])

  // The last instant and state of each contact in the log
  const last = new Map<number, { at: number; state: string | null }>()
  for (const row of taskEventLog) {
    if (row.taskId == null) continue
    const at = row.createdAt!.getTime()
    const prev = last.get(row.taskId)
    if (prev && at < prev.at) continue
    const stateRow = row.action === "state_change" || row.action === "call"
    last.set(row.taskId, {
      at,
      state: stateRow ? (row.toState ?? null) : (prev?.state ?? null),
    })
  }

  const current = new Map(tasks.map((task) => [task.id, task]))
  const candidates = tasks.filter((task) => {
    if (
      task.isActive !== true ||
      task.operatorId == null ||
      excluded.has(task.operatorId) ||
      task.customerId == null ||
      !isKeeping(task.state)
    ) {
      return false
    }
    const alert = task.alertId == null ? undefined : alertById.get(task.alertId)
    if (alert !== undefined && !alert.isResolved) return false
    const log = last.get(task.id)
    return log !== undefined && log.state === task.state
  })

  const slots: Date[] = []
  for (const dayOf of [day, addDays(day, -1)]) {
    for (const [hour, calls] of TEAM_CALLS_PER_HOUR) {
      for (let k = 0; k < calls; k++) {
        slots.push(romeAt(dayOf, hour, rng.int(0, 59)))
      }
    }
  }
  slots.sort((a, b) => a.getTime() - b.getTime())

  /** A version-4 uuid from the seeded generator (the `request_id`). */
  const uuid = () => {
    const part = (length: number) =>
      range(length)
        .map(() => rng.int(0, 15).toString(16))
        .join("")
    return `${part(8)}-${part(4)}-4${part(3)}-${rng.pick(["8", "9", "a", "b"])}${part(3)}-${part(12)}`
  }

  const calls: TaskEventLogRow[] = []
  for (const at of slots) {
    const ms = at.getTime()
    // In time order: a contact takes a later call only after its last row
    const pool = candidates.filter((task) => last.get(task.id)!.at < ms)
    if (pool.length === 0) continue
    const task = rng.pick(pool)
    const state = task.state as KeepingState
    calls.push({
      id: 0, // numbered below
      createdAt: at,
      alertId: null,
      fromState: state,
      toState: state,
      fromOperatorId: null,
      toOperatorId: null,
      customerId: task.customerId!,
      taskId: task.id,
      actorOperatorId: task.operatorId!,
      action: "call",
      source: rng.pick(["detail", "list"] as const),
      outcome: state,
      origin: "list",
      requestId: uuid(),
    })
    last.set(task.id, { at: ms, state })
    current.set(task.id, { ...current.get(task.id)!, closedAt: at })
  }

  const log = [...taskEventLog, ...calls]
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    .map((row, k) => ({ ...row, id: LOG_ID_START + k }))
  return {
    tasks: tasks.map((task) => current.get(task.id)!),
    taskEventLog: log,
  }
}
