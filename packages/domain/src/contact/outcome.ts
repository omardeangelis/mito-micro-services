import type { TaskStatus } from "../schemas"
import type { ContactState } from "./status"

/** The four outcomes of «Registra chiamata», in the order of the buttons. */
export const callOutcomes = [
  "non risponde",
  "richiamare",
  "app.to",
  "non interessato",
] as const satisfies readonly TaskStatus[]

export type CallOutcome = (typeof callOutcomes)[number]

/** The open alert of a contact: its due day as `YYYY-MM-DD` (Rome). */
export type OpenAlert = { day: string }

/** What a call does to the open alert (AC8). */
export type AlertEffect = "keep" | "close" | "replace"

/**
 * The state after a call and what it does to the open alert (AC8). Non
 * risponde follows the alert: with a future one the contact stays in Richiamo
 * (AC4), with an expired or today's one, or none, it becomes Non risponde.
 * `state` is the state before; no outcome depends on it, since a call is only
 * allowed from some states (AC12) and the caller checks that.
 */
export const outcomeEffect = (
  outcome: CallOutcome,
  _state: TaskStatus | null,
  alert: OpenAlert | null,
  today: string
): { state: ContactState; alert: AlertEffect } => {
  switch (outcome) {
    case "non risponde":
      return {
        state: isFutureAlert(alert, today) ? "richiamare" : "non risponde",
        alert: "keep",
      }
    case "richiamare":
      return { state: "richiamare", alert: "replace" }
    case "app.to":
      return { state: "app.to", alert: "close" }
    case "non interessato":
      return { state: "non interessato", alert: "close" }
  }
}

const isFutureAlert = (alert: OpenAlert | null, today: string): boolean =>
  alert !== null && alert.day > today

/** Whether closing the alert needs a confirmation: only a future one (AC14). */
export const needsConfirmation = (
  alert: OpenAlert | null,
  today: string
): boolean => isFutureAlert(alert, today)
