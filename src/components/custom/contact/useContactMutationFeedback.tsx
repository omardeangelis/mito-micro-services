"use client"

import { useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { readContactError } from "@/lib/domain/contact/errors"
import { describeContactError } from "./describeContactError"

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
   * Called instead of `router.refresh()` after the toast, e.g. the `refresh`
   * of `useRefreshAfterSave`, so the caller knows when the refresh ends.
   */
  refresh?: () => void
}

/**
 * The `onError` of a contact mutation (AC52).
 *
 * `onError(error)` returns:
 * - `{ alert }` for ALERT_CONFIRMATION_REQUIRED: no toast, no refresh, the
 *   caller opens its confirmation modal or updates the callback form;
 * - `null` for every other error: a destructive toast with the reason, and a
 *   refresh (`options.refresh`, `router.refresh()` by default) so the control
 *   returns to the saved value.
 */
export const useContactMutationFeedback = (
  options?: ContactMutationFeedbackOptions
) => {
  const { toast } = useToast()
  const router = useRouter()
  const activeContactHref = options?.activeContactHref
  const refresh = options?.refresh

  const onError = useCallback(
    (error: unknown): { alert: PendingAlert } | null => {
      const contactError = readContactError(error)
      if (contactError?.code === "ALERT_CONFIRMATION_REQUIRED") {
        return { alert: contactError.payload.alert }
      }

      const activeTaskId =
        contactError?.code === "CONTACT_SUPERSEDED"
          ? contactError.payload.activeTaskId
          : null
      toast({
        variant: "destructive",
        duration: 8000,
        description: describeContactError(error),
        ...(activeContactHref && activeTaskId !== null
          ? {
              action: (
                <ToastAction altText="Vai al contatto attivo" asChild>
                  <Link href={activeContactHref(activeTaskId)} scroll={false}>
                    Vai al contatto attivo
                  </Link>
                </ToastAction>
              ),
            }
          : {}),
      })
      if (refresh) refresh()
      else router.refresh()
      return null
    },
    [toast, router, activeContactHref, refresh]
  )

  return { onError }
}
