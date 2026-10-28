import type { TaskStatus } from "../schemas"
import { outcomeStates } from "../contact/status"

/**
 * The states a call starts from: the ones in the queue (`chiamare`,
 * `followup`, `non risponde`) and `richiamare`, a callback.
 */
export const callFromStates = [
  "chiamare",
  "followup",
  "non risponde",
  "richiamare",
] as const satisfies readonly TaskStatus[]

/** The state of a call nobody answered. */
export const noAnswerState = "non risponde" satisfies TaskStatus

/** The state of a call that set an appointment. */
export const appointmentState = "app.to" satisfies TaskStatus

/** The states a call ends in: an outcome, or no answer. */
export const callToStates = [
  ...outcomeStates,
  noAnswerState,
] as const satisfies readonly TaskStatus[]

/**
 * Whether a manual change of state from `from` to `to` is a call: from a state
 * of `callFromStates` to one of `callToStates`. A change between two outcomes
 * (e.g. `app.to` → `caricato`) is a step of the practice, not a call.
 */
export const isCall = (from: TaskStatus | null, to: TaskStatus): boolean =>
  from !== null &&
  from !== to &&
  (callFromStates as readonly TaskStatus[]).includes(from) &&
  (callToStates as readonly TaskStatus[]).includes(to)

/** The four totals of the export. */
export type CallTotals = {
  calls: number
  answered: number
  appointments: number
  noAnswer: number
}

/** The totals of one operator in the period. */
export type OperatorCalls = CallTotals & {
  operatorId: number
  name: string
  surname: string
}

/** The calls export of a period: one row per operator with calls, and the totals. */
export type CallStats = {
  rows: readonly OperatorCalls[]
  totals: CallTotals
}

const byName = (a: OperatorCalls, b: OperatorCalls) =>
  a.surname.localeCompare(b.surname, "it") ||
  a.name.localeCompare(b.name, "it") ||
  a.operatorId - b.operatorId

/** The rows in the order of the export: more calls first, then by surname and name (AC12). */
export const sortByCalls = (rows: readonly OperatorCalls[]): OperatorCalls[] =>
  [...rows].sort((a, b) => b.calls - a.calls || byName(a, b))

/** Appointments over answered calls, 0 without answered calls (AC18). */
export const appointmentRate = (row: CallTotals): number =>
  row.answered === 0 ? 0 : row.appointments / row.answered

/** The ranking of the operators by appointment rate, then by surname and name (AC18). */
export const rankByAppointmentRate = (
  rows: readonly OperatorCalls[]
): OperatorCalls[] =>
  [...rows].sort(
    (a, b) => appointmentRate(b) - appointmentRate(a) || byName(a, b)
  )

/** The sum of the four totals over every operator (AC12). */
export const totalsOf = (rows: readonly CallTotals[]): CallTotals =>
  rows.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      answered: sum.answered + row.answered,
      appointments: sum.appointments + row.appointments,
      noAnswer: sum.noAnswer + row.noAnswer,
    }),
    { calls: 0, answered: 0, appointments: 0, noAnswer: 0 }
  )
