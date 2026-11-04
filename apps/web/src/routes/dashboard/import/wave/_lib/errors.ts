import { isApiFailure } from "@/api/errors"

/**
 * The refusals of access a deadline save can get (AC16 for the deadline): the
 * same text for the first step and for «Proroga» (AC20). `null` for any other
 * failure
 */
export function deadlineRefusal(error: unknown): string | null {
  if (!isApiFailure(error)) return null
  switch (error._tag) {
    case "Unauthorized":
    case "OperatorDisabled":
      return "La sessione è scaduta: accedi di nuovo. La scadenza non è cambiata."
    case "NotAdmin":
    case "NotAnOperator":
      return "Solo un admin può cambiare la scadenza."
    default:
      return null
  }
}

/** What a failed save of the deadline of the first step says (AC7, AC16) */
export function confirmFailureText(error: unknown): string {
  const refusal = deadlineRefusal(error)
  if (refusal !== null) return refusal
  if (isApiFailure(error) && error._tag === "ApiUnavailable") {
    return "Non sappiamo se la scadenza è stata salvata. Riprova: salvarla di nuovo non cambia nulla."
  }
  return "Non è stato possibile salvare la scadenza. Riprova."
}
