import { type ApiError } from "@mito/contract/errors"
import { type CallOutcome } from "@mito/domain/contact/outcome"
import { stateLabel } from "@mito/domain/contact/status"
import { romeDay, romeTime } from "@mito/domain/contact/time"
import { dayMonth } from "./format"

/** The link of a notice: to the contact of the row, or to `taskId` */
export type RejectionLink = { label: string; taskId?: number }

/**
 * What a refused call shows: a notice (`toast`), the text under the calendar
 * (`deadlinePast`), the expired session (`session`), or a colleague's call,
 * which closes the row (`worked`).
 */
export type CallRejection =
  | {
      kind: "toast"
      title: string
      description: string
      link: RejectionLink | null
    }
  | { kind: "deadlinePast"; text: string }
  | { kind: "session" }
  | { kind: "worked"; by: string; at: Date }

const OPEN_CONTACT: RejectionLink = { label: "Apri il contatto" }

const notice = (
  description: string,
  link: RejectionLink | null = OPEN_CONTACT
): CallRejection => ({
  kind: "toast",
  title: "Chiamata non registrata",
  description,
  link,
})

/** Every refusal with no words of its own, a `refused` call too (A3) */
const OTHER = notice(
  "La chiamata non si può registrare su questo contatto. Apri il contatto per vedere perché."
)

/**
 * The words of the operator for a refused call (AC27): `error` is what the
 * server declared, `null` a `refused` call. Not `describeApiError`: these
 * texts are different, and they never show a value of the database.
 */
export const describeCallRejection = (
  error: ApiError | null,
  { customer, outcome }: { customer: string; outcome: CallOutcome }
): CallRejection => {
  switch (error?._tag) {
    case "ContactForbidden":
      return notice(
        error.assignee === null
          ? "Non è più assegnato a te: la chiamata non è registrata."
          : `Ora è di ${error.assignee}: la chiamata non è registrata.`
      )
    case "ContactSuperseded":
      return notice(
        "Il contatto è stato sostituito da uno più recente.",
        error.activeTaskId === null
          ? OPEN_CONTACT
          : { label: "Apri il contatto attuale", taskId: error.activeTaskId }
      )
    case "AlertConfirmationRequired":
      return notice(
        `${customer} ha già un richiamo il ${dayMonth(romeDay(error.alert.deadline))}. Apri il contatto per registrare la chiamata.`
      )
    case "CallNotAllowed": {
      if (error.state === null) return OTHER
      const state = stateLabel(error.state)
      return notice(
        outcome === "richiamare"
          ? `Con lo stato ${state} non si può impostare un richiamo.`
          : `Con lo stato ${state} non si può registrare ${stateLabel(outcome)}.`
      )
    }
    case "ContactNotFound":
      return notice("Il contatto non esiste più.", null)
    case "DeadlineInPast":
      return {
        kind: "deadlinePast",
        text: "Il richiamo si imposta da domani: scegli un altro giorno",
      }
    case "Unauthorized":
      return { kind: "session" }
    case "CallAlreadyWorked":
      return { kind: "worked", by: error.by, at: error.at }
    default:
      return OTHER
  }
}

/** Whether the rows are read again after it: not for a day or a session (AC27) */
export const reloadsRows = ({ kind }: CallRejection) =>
  kind === "toast" || kind === "worked"

/** «Già lavorato da Bruno Neri alle 17:41», in the notice and on the row (AC27) */
export const workedText = ({ by, at }: { by: string; at: Date }) =>
  `Già lavorato da ${by} alle ${romeTime(at)}`
