// The `task_event_log` of the local seed (AC26, L1/L2). Rows are collected as
// drafts with the day they fall on (an offset from D), then sorted by day and
// numbered from 1000, so id order is time order, as in an append-only log.
// Every row is at Rome noon, within the contact's lifetime, never on the day
// D - 3 months (where `cleanup-task-event-log` would depend on the hour).
import { taskStatus } from "@/server/db/schema/index"
import type { TaskEventLogRow } from "../types"
import type { DayClock } from "./clock"
import { SYSTEM_OPERATOR_ID } from "./operators"
import type { Random } from "./random"

export type TaskStatus = (typeof taskStatus)[number]
type Source = TaskEventLogRow["source"]

export const LOG_ID_START = 1000

/** The first rows of each action cycle these sources, so all of them appear. */
const STATE_SOURCES: readonly Source[] = ["detail", "list", "bulk"]
const REASSIGN_SOURCES: readonly Source[] = [
  "detail",
  "list",
  "bulk",
  "self_assign",
]

type Draft = Omit<TaskEventLogRow, "id" | "createdAt"> & {
  offset: number
  seq: number
}

export type Log = ReturnType<typeof createLog>

export function createLog({
  rng,
  clock,
  cutoff,
  realOperatorIds,
  adminIds,
}: {
  rng: Random
  clock: DayClock
  /** Offset of the day D - 3 months: no row on it. */
  cutoff: number
  /** Operators that act by hand: neither the system nor the empty one. */
  realOperatorIds: readonly number[]
  adminIds: readonly number[]
}) {
  const drafts: Draft[] = []
  let stateRows = 0
  let reassignRows = 0

  const push = (draft: Omit<Draft, "seq">) =>
    drafts.push({ ...draft, seq: drafts.length })

  const empty = {
    alertId: null,
    fromState: null,
    toState: null,
    fromOperatorId: null,
    toOperatorId: null,
  }

  const otherState = (state: TaskStatus) =>
    rng.pick(taskStatus.filter((each) => each !== state))
  const otherOperator = (operatorId: number) =>
    rng.pick(realOperatorIds.filter((id) => id !== operatorId))

  /** A day in [min, max] (offsets), not on the cutoff; null if impossible. */
  const pickDay = (min: number, max: number): number | null => {
    const day = rng.int(min, max)
    if (day !== cutoff) return day
    if (day + 1 <= max) return day + 1
    if (day - 1 >= min) return day - 1
    return null
  }

  /** `count` days in [min, max], oldest first; null if one is impossible. */
  const pickDays = (count: number, min: number, max: number) => {
    const days: number[] = []
    for (let k = 0; k < count; k++) {
      const day = pickDay(min, max)
      if (day === null) return null
      days.push(day)
    }
    return days.sort((a, b) => b - a)
  }

  /**
   * State changes on `days` (oldest first) ending in `final`; with `before`,
   * the last one goes from `before` to `final`.
   */
  const stateChain = ({
    customerId,
    taskId,
    operatorId,
    final,
    before,
    days,
  }: {
    customerId: string
    taskId: number
    operatorId: number | null
    final: TaskStatus
    before?: TaskStatus
    days: readonly number[]
  }) => {
    if (days.some((day) => day === cutoff)) return
    const states: TaskStatus[] = []
    states[days.length] = final
    for (let k = days.length - 1; k >= 0; k--) {
      states[k] =
        k === days.length - 1 && before ? before : otherState(states[k + 1]!)
    }
    days.forEach((offset, k) => {
      const source =
        stateRows < STATE_SOURCES.length
          ? STATE_SOURCES[stateRows]!
          : rng.weighted<Source>([
              ["detail", 50],
              ["list", 30],
              ["bulk", 20],
            ])
      stateRows++
      push({
        ...empty,
        offset,
        customerId,
        taskId,
        actorOperatorId:
          source === "bulk"
            ? rng.pick(adminIds)
            : (operatorId ?? rng.pick(realOperatorIds)),
        action: "state_change",
        source,
        fromState: states[k]!,
        toState: states[k + 1]!,
      })
    })
  }

  /** The contact passes from another real operator to `toOperatorId`. */
  const reassign = ({
    customerId,
    taskId,
    toOperatorId,
    offset,
  }: {
    customerId: string
    taskId: number
    toOperatorId: number
    offset: number | null
  }) => {
    if (offset === null || offset === cutoff) return
    const source =
      reassignRows < REASSIGN_SOURCES.length
        ? REASSIGN_SOURCES[reassignRows]!
        : rng.weighted<Source>([
            ["detail", 30],
            ["list", 20],
            ["bulk", 25],
            ["self_assign", 25],
          ])
    reassignRows++
    push({
      ...empty,
      offset,
      customerId,
      taskId,
      actorOperatorId:
        source === "self_assign"
          ? toOperatorId
          : source === "bulk"
            ? rng.pick(adminIds)
            : rng.pick(realOperatorIds),
      action: "operator_reassign",
      source,
      fromOperatorId: otherOperator(toOperatorId),
      toOperatorId,
    })
  }

  /** An operator closes the alert by changing the contact's state. */
  const alertResolved = ({
    customerId,
    taskId,
    alertId,
    actorOperatorId,
    offset,
  }: {
    customerId: string
    taskId: number
    alertId: number
    actorOperatorId: number
    offset: number
  }) => {
    if (offset === cutoff) return
    push({
      ...empty,
      offset,
      customerId,
      taskId,
      alertId,
      actorOperatorId,
      action: "alert_resolved",
      source: "detail",
    })
  }

  /**
   * The two rows of a past run of the `alert` cron on an alert due that day:
   * the alert resolved, and the old contact's state change to `followup`.
   */
  const cronAlert = ({
    customerId,
    taskId,
    alertId,
    fromState,
    offset,
  }: {
    customerId: string
    taskId: number
    alertId: number
    fromState: TaskStatus
    offset: number
  }) => {
    if (offset === cutoff) return
    const cron = {
      ...empty,
      offset,
      customerId,
      taskId,
      actorOperatorId: SYSTEM_OPERATOR_ID,
      source: "cron_alert",
    } as const
    push({ ...cron, action: "alert_resolved", alertId })
    push({ ...cron, action: "state_change", fromState, toState: "followup" })
  }

  /** The rows, oldest first, numbered from 1000. */
  const rows = (): TaskEventLogRow[] =>
    [...drafts]
      .sort((a, b) => b.offset - a.offset || a.seq - b.seq)
      .map(({ offset, seq: _seq, ...row }, k) => ({
        id: LOG_ID_START + k,
        createdAt: clock.noon(offset),
        ...row,
      }))

  return {
    pickDay,
    pickDays,
    stateChain,
    reassign,
    alertResolved,
    cronAlert,
    rows,
  }
}
