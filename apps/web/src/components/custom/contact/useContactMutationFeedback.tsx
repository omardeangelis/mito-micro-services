import { useCallback } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { describeApiError, type ApiFailure } from "@/api/errors"
import { navigateOnPlainClick } from "./navigateOnPlainClick"

/** The open alert a rejected change would close, handed back to the caller. */
export type PendingAlert = {
  id: number
  deadline: Date
  message: string | null
}

export type ContactMutationFeedbackOptions = {
  /**
   * Link to the customer's active contact. When given, the "superseded" toast
   * offers it (AC52). The controls of Contatti always give it, carrying the
   * list state.
   */
  activeContactHref?: (activeTaskId: number) => string
  /**
   * Called after the toast, e.g. the `refresh` of `useRefreshAfterSave`, so
   * the control returns to the saved value.
   */
  refresh: () => void
}

/**
 * The reason of a rejected contact change, as `describeContactError` of the
 * Next.js app: the texts of the contract, but a change the server never
 * answered is "not saved", and an operator it doesn't know is "not valid".
 * The detail says it also inside the sheet, which hides the toasts
 */
export const describeRejection = (error: ApiFailure): string => {
  switch (error._tag) {
    case "ApiUnavailable":
      return "Modifica non salvata, riprova"
    case "OperatorNotFound":
      return "Operatore non valido"
    default:
      return describeApiError(error)
  }
}

/**
 * The `onError` of a contact mutation (AC52), as the hook of the same name
 * of the Next.js app, on the errors of the contract.
 *
 * `onError(error)` returns:
 * - `{ alert }` for `AlertConfirmationRequired`: no toast, no refresh, the
 *   caller opens its confirmation modal or updates the callback form;
 * - `null` for every other error: a destructive toast with the reason, and
 *   `refresh`, so the control returns to the saved value.
 *
 * The toast is outside the routes: its link navigates with the router of the
 * control
 */
export const useContactMutationFeedback = ({
  activeContactHref,
  refresh,
}: ContactMutationFeedbackOptions) => {
  const navigate = useNavigate()

  const onError = useCallback(
    (error: ApiFailure): { alert: PendingAlert } | null => {
      if (error._tag === "AlertConfirmationRequired") {
        return { alert: error.alert }
      }

      const activeTaskId =
        error._tag === "ContactSuperseded" ? error.activeTaskId : null
      const href =
        activeContactHref && activeTaskId !== null
          ? activeContactHref(activeTaskId)
          : null
      // On a plain click the link closes the toast, so it reads the id of
      // the call that shows it
      const id = toast.error("", {
        duration: 8000,
        description: describeRejection(error),
        ...(href !== null
          ? {
              action: (
                <a
                  href={href}
                  data-button=""
                  onClick={navigateOnPlainClick((to) => {
                    toast.dismiss(id)
                    void navigate(to, { preventScrollReset: true })
                  }, href)}
                >
                  Vai al contatto attivo
                </a>
              ),
            }
          : {}),
      })
      refresh()
      return null
    },
    [navigate, activeContactHref, refresh]
  )

  return { onError }
}
