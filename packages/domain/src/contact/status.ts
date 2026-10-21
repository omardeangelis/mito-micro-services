import type { TaskCategory, TaskStatus } from "../schemas"

/** The states that put the contact in the call queue. */
export const callStates = [
  "chiamare",
  "followup",
] as const satisfies readonly TaskStatus[]

/** The states that record an outcome of a call. */
export const outcomeStates = [
  "app.to",
  "caricato",
  "erogata",
  "non interessato",
  "richiamare",
] as const satisfies readonly TaskStatus[]

/**
 * Every state in the order of the `taskStatus` enum. Written out here so the
 * module stays free of runtime imports from the schema; the type check ties
 * it to `TaskStatus`.
 */
export const allStates = [
  "chiamare",
  "non interessato",
  "app.to",
  "caricato",
  "richiamare",
  "erogata",
  "nessuno",
  "followup",
] as const satisfies readonly TaskStatus[]

type MissingStates = Exclude<TaskStatus, (typeof allStates)[number]>
// Fails to compile when `taskStatus` gains a state `allStates` lacks.
const _allStatesAreComplete: [MissingStates] extends [never] ? true : never =
  true
void _allStatesAreComplete

/**
 * Category of a state: "open" (da chiamare), "close" (con esito) or "idle"
 * (`nessuno`). A null state, the column default, counts as `nessuno`.
 */
export const stateCategory = (state: TaskStatus | null): TaskCategory => {
  if (state === null) return "idle"
  if ((callStates as readonly TaskStatus[]).includes(state)) return "open"
  if ((outcomeStates as readonly TaskStatus[]).includes(state)) return "close"
  return "idle"
}

/**
 * Whether a manual change from `from` to `to` is allowed (AC30): `followup`
 * is only set by the cron, and from `followup` there is no way back to
 * `chiamare`.
 */
export const isAllowedChange = (
  from: TaskStatus | null,
  to: TaskStatus
): boolean => {
  if (to === "followup") return false
  if (from === "followup" && to === "chiamare") return false
  return true
}

/**
 * The states a person can pick by hand from `current` (AC30), in the order
 * of the `taskStatus` enum. The current state is left out.
 */
export const selectableStates = (current: TaskStatus | null): TaskStatus[] =>
  allStates.filter(
    (state) =>
      state !== (current ?? "nessuno") && isAllowedChange(current, state)
  )

/**
 * Whether "Imposta richiamo" is available (AC46): only when the state has an
 * outcome or is `nessuno` (a null state counts as `nessuno`).
 */
export const canSetCallback = (state: TaskStatus | null): boolean =>
  stateCategory(state) !== "open"
