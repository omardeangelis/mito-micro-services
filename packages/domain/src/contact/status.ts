import type { TaskCategory, TaskStatus } from "../schemas"

/** The states that put the contact in the call queue. */
export const callStates = [
  "chiamare",
  "followup",
  "non risponde",
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
  "non risponde",
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
 * is only set by the cron, and from `followup` or `non risponde` (already in
 * the queue) there is no way back to `chiamare`.
 */
export const isAllowedChange = (
  from: TaskStatus | null,
  to: TaskStatus
): boolean => {
  if (to === "followup") return false
  if (to === "chiamare" && (from === "followup" || from === "non risponde")) {
    return false
  }
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

/** The six states a contact can have (esiti-richiami-stati AC1), in DB values. */
export const contactStates = [
  "chiamare",
  "non risponde",
  "richiamare",
  "app.to",
  "caricato",
  "non interessato",
] as const satisfies readonly TaskStatus[]

export type ContactState = (typeof contactStates)[number]

/**
 * The new state a stored value stands for: `followup` and `nessuno` (and a
 * null state) are Da chiamare, `erogata` is Pratica caricata (AC30).
 */
export const toContactState = (state: TaskStatus | null): ContactState => {
  if (state === null || state === "followup" || state === "nessuno") {
    return "chiamare"
  }
  if (state === "erogata") return "caricato"
  return state
}

const stateLabels: Record<ContactState, string> = {
  chiamare: "Da chiamare",
  "non risponde": "Non risponde",
  richiamare: "Richiamo",
  "app.to": "Appuntamento",
  caricato: "Pratica caricata",
  "non interessato": "Non interessato",
}

/**
 * The label of a state (AC1). Richiamo carries the day of the open alert as
 * «Richiamo · gg/mm» (`alertDay` is `YYYY-MM-DD`), «Richiamo» without it.
 * Legacy values get the label of their new state (AC30).
 */
export const stateLabel = (
  state: TaskStatus | null,
  alertDay?: string | null
): string => {
  const current = toContactState(state)
  if (current === "richiamare" && alertDay) {
    const [, month = "", day = ""] = alertDay.split("-")
    return `Richiamo · ${day}/${month}`
  }
  return stateLabels[current]
}

/** The states still to call (AC6). */
export const queueStates = [
  "chiamare",
  "non risponde",
] as const satisfies readonly ContactState[]

/** The states already worked (AC6). */
export const doneStates = [
  "richiamare",
  "app.to",
  "caricato",
  "non interessato",
] as const satisfies readonly ContactState[]

/** The states a call can be registered on (AC12). */
export const callableStates = [
  "chiamare",
  "non risponde",
  "richiamare",
] as const satisfies readonly ContactState[]

/**
 * The states the selector offers from `state` (AC17): Pratica caricata from
 * every other state, Da chiamare only from the states without an open alert
 * that end the work (a reopening).
 */
export const selectorTargets = (state: TaskStatus | null): ContactState[] => {
  const current = toContactState(state)
  const targets: ContactState[] = []
  if (current !== "caricato") targets.push("caricato")
  if (
    current === "app.to" ||
    current === "caricato" ||
    current === "non interessato"
  ) {
    targets.unshift("chiamare")
  }
  return targets
}

/** The states «Togli il richiamo» offers (AC22): never Richiamo. */
export const removeCallbackTargets = [
  "chiamare",
  "non risponde",
  "app.to",
  "caricato",
  "non interessato",
] as const satisfies readonly ContactState[]
