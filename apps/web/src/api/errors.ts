import { type ApiFailure } from "./runtime"

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
    case "ApiUnavailable":
      return "Il servizio non risponde, riprova tra poco"
    default: {
      const unhandled: never = error
      return unhandled
    }
  }
}
