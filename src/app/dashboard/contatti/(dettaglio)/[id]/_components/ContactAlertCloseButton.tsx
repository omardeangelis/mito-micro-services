"use client"

import * as React from "react"
import { X } from "lucide-react"
import { focusIsLost } from "@/components/custom/contact/focus"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { useContactMutationFeedback } from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Button } from "@/components/ui/button"
import { api } from "@/trpc/react"
import { detailHrefFromDa } from "../../../_lib/detailHrefFromDa"
import { useContactSheet } from "../../_components/ContactSheet"

type Props = {
  /** The open alert this button closes */
  alertId: number
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * Where the focus goes once the alert is closed: "Imposta richiamo", or the
 * heading of the section when that button isn't there (a state that can't set
 * a callback). Both are found in the page, not through a ref: they belong to
 * other components.
 */
const focusAfterClosing = () => {
  const target =
    document.querySelector<HTMLElement>("[data-callback-trigger]") ??
    document.querySelector<HTMLElement>("[data-alert-section-heading]")
  target?.focus()
}

/**
 * The "X" of the open alert in the detail (AC29): it closes the alert, which
 * moves to the Storico with the user who closed it. The same call and the same
 * wait as the "X" of the customer's `CustomerAlertCreator`, with the source
 * `detail`.
 *
 * - The alert stays on screen until the refreshed page replaces it; the wait
 *   is the spinner in place of the "X". A second click is ignored (AC39).
 * - A rejection (AC49, AC52) is a toast, said also inside the sheet (the toast
 *   region is hidden to assistive technology while the sheet is open), and the
 *   refresh that shows the saved alert. No confirmation exists for this call.
 *
 * The focus: the refreshed page has no open alert, so this very button
 * unmounts and the focus falls on the page. Closing the alert raises
 * `focusAfter`, and the focus moves either when the wait ends (the button is
 * still here, a new alert took the old one's place) or when the button
 * unmounts. The cleanup of a passive effect runs after React removed the
 * button and mounted what replaces it, so `focusIsLost()` is true and
 * "Imposta richiamo" is already in the page.
 */
export function ContactAlertCloseButton({ alertId, da }: Props) {
  const sheet = useContactSheet()

  // The alert was closed with the "X": the focus moves when the refreshed
  // page is on screen, unless the user moved it meanwhile
  const focusAfter = React.useRef(false)
  const moveFocus = () => {
    if (!focusAfter.current) return
    focusAfter.current = false
    if (focusIsLost()) focusAfterClosing()
  }

  // From the call until the refreshed page is rendered
  const { pending, start, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed(moveFocus)
  const activeContactHref = React.useCallback(
    (activeTaskId: number) => detailHrefFromDa(activeTaskId, da),
    [da]
  )
  const { onError } = useContactMutationFeedback({ refresh, activeContactHref })
  const resolveAlert = api.task.resolveAlert.useMutation()

  // The refreshed page without this alert unmounts the button before the wait
  // can end: the cleanup is the only place left to move the focus. The latest
  // `moveFocus` only reads a ref, so the effect runs once.
  React.useEffect(() => moveFocus, []) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (pending) return
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the button unmounted, so the toast and the refresh still run
    resolveAlert.mutateAsync({ alertId, source: "detail" }).then(
      () => {
        focusAfter.current = true
        finishAfterRefresh()
      },
      (error) => {
        // The alert stays: the toast gives the reason, and the toast region
        // is hidden to assistive technology while the sheet is open: say it
        // inside (`onError` returns null: no confirmation exists)
        onError(error)
        sheet.announceAlert(describeContactError(error))
        // The refresh `onError` started shows the saved alert
        awaitRefresh()
      }
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Chiudi il richiamo"
      aria-busy={pending}
      aria-disabled={pending}
      onClick={close}
    >
      {pending ? (
        <LoadingSpinner className="h-4 w-4 shrink-0 motion-reduce:animate-none" />
      ) : (
        <X size={20} aria-hidden="true" />
      )}
    </Button>
  )
}
