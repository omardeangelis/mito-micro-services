import { isApiError } from "@mito/contract/errors"
import { ApiUnavailable, type ApiFailure } from "./runtime"

/** What a call to the backend fails with, for the code out of `src/api` */
export type { ApiFailure }

/** A failure of a call to the backend, not of the app (a chunk, a bug) */
export const isApiFailure = (error: unknown): error is ApiFailure =>
  isApiError(error) || error instanceof ApiUnavailable

/**
 * The text the user reads for a failed call (F8, H13), as
 * `describeContactError` of the Next.js app: one case per error of the
 * contract, so a new error fails `tsc` here until it has its text. The texts
 * are those of the tRPC errors of today, where they have one
 */
export const describeApiError = (error: ApiFailure): string => {
  switch (error._tag) {
    case "Unauthorized":
      return "Sessione scaduta: accedi di nuovo"
    case "NotAnOperator":
      return "Questo utente non è un operatore"
    case "OperatorDisabled":
      return "Utente disattivato"
    case "NotAdmin":
      return "Solo un admin può farlo"
    case "OperatorNotFound":
      return "Operatore non trovato"
    case "CustomerNotFound":
      return "Cliente non trovato"
    case "CustomerAssignmentForbidden":
      return "Non puoi cambiare l'operatore di questo cliente"
    case "HandoverSameOperator":
      return "Il cliente è già assegnato a questo operatore"
    case "CustomerMissing":
      return `Cliente non trovato: ${error.customerId}`
    case "ContactNotFound":
      return "Contatto non trovato"
    case "ContactForbidden":
      return `Non puoi modificare questo contatto: ${
        error.assignee === null
          ? "non è assegnato"
          : `è assegnato a ${error.assignee}`
      }`
    case "CustomerUnassigned":
      return "Cliente non assegnato"
    case "ContactAlreadyActive":
      return "Questo cliente ha già un contatto attivo"
    case "ContactSuperseded":
      return "Questo contatto è stato sostituito da uno più recente"
    case "TransitionRejected":
      return `Non si può passare da ${error.from ?? "nessuno"} a ${error.to}`
    case "AlertConfirmationRequired":
      return "Il contatto ha un richiamo aperto da confermare"
    case "AlertNotFound":
      return "Alert non trovato"
    case "CallbackNotAllowed":
      return `Non si può impostare un richiamo con lo stato ${error.state ?? "nessuno"}`
    case "DeadlineInPast":
      return "Il richiamo si imposta da domani"
    case "PracticeNotFound":
      return "Pratica non trovata"
    case "PracticeExists":
      return "Questa pratica esiste già"
    case "CustomerExists":
      return "Un cliente collegato esiste già"
    case "ChatMissing":
      return "Chat non trovata"
    case "MessageMissing":
      return "Nota non trovata"
    case "NotMessageAuthor":
      return "Solo l'autore della nota può eliminarla"
    case "InvalidPeriod":
      return "Periodo non valido"
    case "ApiUnavailable":
      return "Il servizio non risponde, riprova tra poco"
    default: {
      const unhandled: never = error
      return unhandled
    }
  }
}
