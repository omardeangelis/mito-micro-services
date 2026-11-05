import { type MyCall, type MyCallback } from "@mito/contract/home"
import { type RegisteredCall } from "@mito/contract/task"
import { type CallOutcome } from "@mito/domain/contact/outcome"

/** The group of a row, fixed when the home loads. */
export type QueueGroup = "overdue" | "today"

/** The outcomes that take the alert away, so they close the row (AC23). */
export type ClosingOutcome = Exclude<CallOutcome, "non risponde">

/**
 * Why a row is closed: `registered` by an outcome of this user (`callbackDay`
 * only for Richiamare), `worked` by someone else's (AC27), `gone` because it
 * is no longer among the user's callbacks (AC23).
 */
export type QueueClosure =
  | {
      kind: "registered"
      outcome: ClosingOutcome
      at: Date
      callbackDay: string | null
    }
  | { kind: "worked"; by: string; at: Date }
  | { kind: "gone" }

/**
 * A row of «Richiami da fare», whose key is `alertId`. `state` is what its
 * badge shows: a `registered` row takes the outcome, with the day of a
 * Richiamare in `closure`, and the other closed rows keep the last one known
 * (D17). `respondedTick` is the tick of the last answer to a press, and
 * `uncertainRequestIds` the presses of an uncertain outcome that may still
 * turn up in the diary (D8).
 */
export type QueueRow = MyCallback & {
  group: QueueGroup
  closure: QueueClosure | null
  respondedTick: number
  uncertainRequestIds: ReadonlyArray<string>
}

/** The rows of a visit: they never change order or number until a new `load`. */
export type Queue = ReadonlyArray<QueueRow>

/** A read of the callbacks, with the tick taken when it started (D8). */
export type QueueRead = {
  rows: ReadonlyArray<MyCallback>
  readTick: number
}

export type QueueCounts = Record<QueueGroup, { open: number; loaded: boolean }>

const closesAlert = (outcome: MyCall["outcome"]): outcome is ClosingOutcome =>
  outcome === "richiamare" ||
  outcome === "app.to" ||
  outcome === "non interessato"

const isClosingCall = (
  call: MyCall
): call is MyCall & { outcome: ClosingOutcome } => closesAlert(call.outcome)

/**
 * Every write goes through here: a row that doesn't change stays the same
 * object, and with no change the queue is the same one, which is what stops
 * the effect of D8.
 */
const mapRows = (queue: Queue, update: (row: QueueRow) => QueueRow): Queue => {
  const next = queue.map(update)
  return next.every((row, index) => row === queue[index]) ? queue : next
}

const mapRow = (
  queue: Queue,
  alertId: number,
  update: (row: QueueRow) => QueueRow
): Queue =>
  mapRows(queue, (row) => (row.alertId === alertId ? update(row) : row))

/** Only `registered` empties the list: the server can still write the others. */
const closeRegistered = (
  row: QueueRow,
  outcome: ClosingOutcome,
  at: Date,
  callbackDay: string | null
): QueueRow => ({
  ...row,
  state: outcome,
  closure: { kind: "registered", outcome, at, callbackDay },
  uncertainRequestIds: [],
})

const sameTime = (a: Date | null, b: Date | null): boolean =>
  a?.getTime() === b?.getTime()

/** What a read can change on an open row (A2). */
const updateFromRead = (row: QueueRow, read: MyCallback): QueueRow =>
  row.state === read.state &&
  row.message === read.message &&
  sameTime(row.triedAt, read.triedAt)
    ? row
    : {
        ...row,
        state: read.state,
        message: read.message,
        triedAt: read.triedAt,
      }

/** The rows of a home load, in the order of the server. */
export const load = (callbacks: ReadonlyArray<MyCallback>): Queue =>
  callbacks.map((callback) => ({
    ...callback,
    group: callback.daysLate > 0 ? "overdue" : "today",
    closure: null,
    respondedTick: 0,
    uncertainRequestIds: [],
  }))

/**
 * A press that went through. Non risponde leaves the row open with the state
 * and the time of the answer (A1), the others close it, even one already
 * `gone` or `worked`: the row's own outcome wins, as in `settleUncertain`.
 */
export const applyRegistered = (
  queue: Queue,
  alertId: number,
  registered: RegisteredCall
): Queue =>
  mapRow(queue, alertId, (row) => {
    const { outcome, at } = registered.call
    if (closesAlert(outcome)) {
      if (row.closure?.kind === "registered") return row
      const callbackDay =
        outcome === "richiamare" ? (registered.alert?.day ?? null) : null
      return closeRegistered(row, outcome, at, callbackDay)
    }
    if (row.closure !== null) return row
    return row.state === registered.state && sameTime(row.triedAt, at)
      ? row
      : { ...row, state: registered.state, triedAt: at }
  })

/** The alert was already worked (AC27): only an own outcome stays. */
export const applyWorked = (
  queue: Queue,
  alertId: number,
  by: string,
  at: Date
): Queue =>
  mapRow(queue, alertId, (row) => {
    const { closure } = row
    if (closure?.kind === "registered") return row
    if (
      closure?.kind === "worked" &&
      closure.by === by &&
      sameTime(closure.at, at)
    ) {
      return row
    }
    return { ...row, closure: { kind: "worked", by, at } }
  })

/** An answer to a press, whatever its outcome: older reads are ignored (D8). */
export const markResponded = (
  queue: Queue,
  alertId: number,
  tick: number
): Queue =>
  mapRow(queue, alertId, (row) =>
    row.respondedTick === tick ? row : { ...row, respondedTick: tick }
  )

/** A press with an uncertain outcome: the diary will tell (AC48). */
export const markUncertain = (
  queue: Queue,
  alertId: number,
  requestId: string
): Queue =>
  mapRow(queue, alertId, (row) =>
    row.uncertainRequestIds.includes(requestId)
      ? row
      : {
          ...row,
          uncertainRequestIds: [...row.uncertainRequestIds, requestId],
        }
  )

/**
 * The uncertain presses the diary shows as written: a call is in the diary
 * only if the server wrote it, so it closes the row with its own outcome and
 * time whatever the rows say, even from `gone` or `worked` (AC23, AC48). Rows
 * with a press under way wait for it, and come back here when it ends.
 *
 * A written Non risponde leaves the row as it is: its «tentato» comes from the
 * rows read again, which are its source, and a read older than the write would
 * take it away.
 */
export const settleUncertain = (
  queue: Queue,
  calls: ReadonlyArray<MyCall>,
  { sending }: { sending: ReadonlySet<number> }
): Queue =>
  mapRows(queue, (row) => {
    if (
      row.closure?.kind === "registered" ||
      row.uncertainRequestIds.length === 0 ||
      sending.has(row.alertId)
    ) {
      return row
    }
    const written = calls.filter(
      ({ requestId }) =>
        requestId !== null && row.uncertainRequestIds.includes(requestId)
    )
    const latest = written.reduce<
      (MyCall & { outcome: ClosingOutcome }) | null
    >(
      (found, call) =>
        isClosingCall(call) && (found === null || call.at > found.at)
          ? call
          : found,
      null
    )
    if (latest === null) return row
    return closeRegistered(
      row,
      latest.outcome,
      latest.at,
      latest.outcome === "richiamare" ? latest.callbackDay : null
    )
  })

/**
 * A read of the rows on a home that didn't load again (AC23, D8). No row
 * appears, leaves or moves: one still in `rows` updates in place (A2), and one
 * no longer there closes as `gone`.
 */
export const reconcile = (
  queue: Queue,
  { rows, readTick }: QueueRead,
  { sending, diaryIdle }: { sending: ReadonlySet<number>; diaryIdle: boolean }
): Queue => {
  const byAlert = new Map(rows.map((row) => [row.alertId, row]))
  return mapRows(queue, (row) => {
    const waits =
      sending.has(row.alertId) ||
      row.respondedTick > readTick ||
      (row.uncertainRequestIds.length > 0 && !diaryIdle)
    if (waits || row.closure !== null) return row
    const read = byAlert.get(row.alertId)
    return read === undefined
      ? { ...row, closure: { kind: "gone" } }
      : updateFromRead(row, read)
  })
}

/**
 * The open rows of each group, and whether the group had rows when the home
 * loaded: a group emptied during the visit keeps its header (AC12, AC13).
 */
export const countsOf = (queue: Queue): QueueCounts => {
  const countGroup = (group: QueueGroup) => {
    const rows = queue.filter((row) => row.group === group)
    return {
      open: rows.filter(({ closure }) => closure === null).length,
      loaded: rows.length > 0,
    }
  }
  return { overdue: countGroup("overdue"), today: countGroup("today") }
}

/**
 * Where the focus goes from a row (AC23): the first open row below, or the
 * last open one above, or the row itself.
 */
export const nextFocus = (queue: Queue, alertId: number): number => {
  const index = queue.findIndex((row) => row.alertId === alertId)
  if (index === -1) return alertId
  const isOpen = ({ closure }: QueueRow) => closure === null
  const target =
    queue.slice(index + 1).find(isOpen) ??
    queue.slice(0, index).reverse().find(isOpen)
  return target?.alertId ?? alertId
}
