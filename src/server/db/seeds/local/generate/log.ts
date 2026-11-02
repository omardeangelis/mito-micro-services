// The `task_event_log` of the local seed (AC26, L1/L2). Rows are collected as
// drafts with the day they fall on (an offset from D), then sorted by day and
// numbered from 1000, so id order is time order, as in an append-only log.
// Every row is at Rome noon, within the contact's lifetime, never on the day
// D - LOG_RETENTION_MONTHS (where `cleanup-task-event-log` would depend on the hour).
//
// Only the six states of esiti-richiami-stati. A call is a `call` row from the
// instant `calls_registry` on (generate/milestones.ts); before it, a call is a
// `state_change` row from the dettaglio or the lista (AC28).
import type { taskStatus } from "@mito/db/schema/index"
import { contactStates } from "@mito/domain/contact/status"
import type { TaskEventLogRow } from "../types"
import type { DayClock } from "./clock"
import { SYSTEM_OPERATOR_ID } from "./operators"
import { range, type Random } from "./random"

export type TaskStatus = (typeof taskStatus)[number]
type Source = TaskEventLogRow["source"]

export const LOG_ID_START = 1000

/**
 * The first rows of each action cycle these sources, so all of them appear. A
 * change of state is never `bulk` (the bulk assignment writes no state, AC25).
 */
const STATE_SOURCES: readonly Source[] = ["detail", "list"]
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
  /** Offset of the day D - LOG_RETENTION_MONTHS: no row on it. */
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
    rng.pick(contactStates.filter((each) => each !== state))
  /** A version-4 uuid from the seeded generator (the `request_id` of a call). */
  const uuid = () => {
    const part = (length: number) =>
      range(length)
        .map(() => rng.int(0, 15).toString(16))
        .join("")
    return `${part(8)}-${part(4)}-4${part(3)}-${rng.pick(["8", "9", "a", "b"])}${part(3)}-${part(12)}`
  }
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
              ["detail", 60],
              ["list", 40],
            ])
      stateRows++
      push({
        ...empty,
        offset,
        customerId,
        taskId,
        actorOperatorId: operatorId ?? rng.pick(adminIds),
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

  /**
   * An operator closes the alert: with a call, with the selector or with
   * «Togli il richiamo» (`source`: the page they did it from).
   */
  const alertResolved = ({
    customerId,
    taskId,
    alertId,
    actorOperatorId,
    offset,
    source = "detail",
  }: {
    customerId: string
    taskId: number
    alertId: number
    actorOperatorId: number
    offset: number
    source?: "detail" | "list"
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
      source,
    })
  }

  /**
   * The row of the nightly pass on an alert due that day (AC19): the contact
   * goes from Richiamo to Da chiamare, the alert stays open. Not a call.
   */
  const nightlyPass = ({
    customerId,
    taskId,
    offset,
  }: {
    customerId: string
    taskId: number
    offset: number
  }) => {
    if (offset === cutoff) return
    push({
      ...empty,
      offset,
      customerId,
      taskId,
      actorOperatorId: SYSTEM_OPERATOR_ID,
      source: "cron_alert",
      action: "state_change",
      fromState: "richiamare",
      toState: "chiamare",
    })
  }

  /**
   * A registered call (AC9): `alertId` is the open alert after it, the new one
   * of a Richiamare or the one a Non risponde kept. The caller says which
   * `origin` it has (AC10) and which states it moves between.
   */
  const call = ({
    customerId,
    taskId,
    alertId,
    actorOperatorId,
    source,
    outcome,
    origin,
    fromState,
    toState,
    offset,
  }: {
    customerId: string
    taskId: number
    alertId: number | null
    actorOperatorId: number
    source: "detail" | "list"
    outcome: NonNullable<TaskEventLogRow["outcome"]>
    origin: "alert" | "list"
    fromState: TaskStatus
    toState: TaskStatus
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
      action: "call",
      source,
      fromState,
      toState,
      outcome,
      origin,
      requestId: uuid(),
    })
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
    nightlyPass,
    call,
    rows,
  }
}
