import { readContactError } from "@mito/domain/contact/errors"

/** What the user reads when the error is not a contact error (network, server). */
const GENERIC_MESSAGE = "Modifica non salvata, riprova"

/**
 * The Italian message for an error from a contact or customer mutation (AC52).
 * Pure: no React. Anything that is not a known contact error, network and
 * server errors included, gets the generic "retry" message.
 */
export const describeContactError = (error: unknown): string => {
  const contactError = readContactError(error)
  if (!contactError) return GENERIC_MESSAGE

  switch (contactError.code) {
    case "CONTACT_FORBIDDEN":
      return `Non puoi modificare questo contatto: ${
        contactError.payload.assignee === null
          ? "non è assegnato"
          : `è assegnato a ${contactError.payload.assignee}`
      }`
    case "CONTACT_SUPERSEDED":
      return "Questo contatto è stato sostituito da uno più recente"
    case "CUSTOMER_UNASSIGNED":
      return "Cliente non assegnato"
    case "CONTACT_ALREADY_ACTIVE":
      return "Questo cliente ha già un contatto attivo"
    case "CONTACT_TRANSITION_REJECTED":
      return `Non si può passare da ${contactError.payload.from ?? "nessuno"} a ${contactError.payload.to}`
    case "CALLBACK_NOT_ALLOWED":
      return `Non si può impostare un richiamo con lo stato ${contactError.payload.state ?? "nessuno"}`
    case "DEADLINE_IN_PAST":
      return "Il richiamo si imposta da domani"
    case "CUSTOMER_ASSIGNMENT_FORBIDDEN":
      // From "Passaggio di consegne" and from "Assegna a te" alike
      return "Non puoi cambiare l'operatore di questo cliente"
    case "HANDOVER_SAME_OPERATOR":
      return "Il cliente è già assegnato a questo operatore"
    case "OPERATOR_DISABLED":
      return "Utente disattivato"
    case "OPERATOR_IS_ADMIN":
      return "Declassa l'admin a operatore prima di disattivarlo"
    case "CANNOT_DEACTIVATE_SELF":
      return "Non puoi disattivare te stesso"
    case "LAST_ADMIN":
      return "Deve restare almeno un admin"
    case "OPERATOR_NOT_FOUND":
      return "Operatore non valido"
    case "CONTACT_NOT_FOUND":
      return "Contatto non trovato"
    case "ALERT_NOT_FOUND":
      return "Alert non trovato"
    case "CUSTOMER_NOT_FOUND":
      return "Cliente non trovato"
    case "ALERT_CONFIRMATION_REQUIRED":
      return "Il contatto ha un richiamo aperto da confermare"
    case "PRACTICE_NOT_FOUND":
      return "Pratica non trovata"
    case "PRACTICE_EXISTS":
      return "Questa pratica esiste già"
    case "CUSTOMER_EXISTS":
      return "Un cliente collegato esiste già"
    default: {
      // A new code in `contactErrorCodes` makes this assignment fail to compile
      const unhandled: never = contactError
      return unhandled
    }
  }
}
