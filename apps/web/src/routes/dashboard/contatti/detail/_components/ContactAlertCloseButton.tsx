import * as React from "react"
import { X } from "lucide-react"
import { focusIsLost } from "@/components/custom/contact/focus"
import {
  describeRejection,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatDateAsDMY } from "@mito/client/format"
import {
  type ContactState,
  removeCallbackTargets,
  stateLabel,
} from "@mito/domain/contact/status"
import { type ApiFailure } from "@/api/errors"
import { useRemoveCallback } from "@/api/task"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { useContactSheet } from "./ContactSheet"

type Props = {
  /** The open alert «Togli il richiamo» closes */
  alert: { id: number; deadline: Date; message: string | null }
  /** The contact the alert is shown on */
  taskId: number
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * Where the focus goes once the alert is closed: the heading of the section,
 * found in the page, not through a ref: it belongs to another component.
 */
const focusAfterClosing = () => {
  document.querySelector<HTMLElement>("[data-alert-section-heading]")?.focus()
}

/**
 * The "X" of the open alert in the detail, «Togli il richiamo»
 * (esiti-richiami-stati AC22): it no longer closes the alert by itself. It
 * opens a dialog with the day and the message of the alert, which asks the new
 * state of the contact: Da chiamare, Non risponde, Appuntamento, Pratica
 * caricata or Non interessato, none chosen to begin with and never Richiamo.
 * «Conferma» stays off until one is chosen; «Annulla» changes nothing.
 *
 * Confirming calls `removeCallback` and waits with `useSavingUntilRefreshed`,
 * as the other controls of the contact do: the contact stays the same, with
 * the chosen state, even when it is the one it had.
 *
 * - The alert stays on screen until the refreshed page replaces it; the wait
 *   is the spinner in place of the "X". A second click is ignored (AC39).
 * - A rejection (AC49, AC52) is a toast, said also inside the sheet (the toast
 *   region is hidden to assistive technology while the sheet is open), and the
 *   refresh that shows the contact as it is now. `CallbackChanged`, the
 *   callback replaced or closed by someone else meanwhile, is one of them:
 *   the contact is read again and shown as it is, with its reason.
 *
 * The focus: Annulla and Esc give it back to the "X". After a saved change the
 * refreshed page has no open alert, so this very button unmounts and the focus
 * would fall on the page. Closing the alert raises `focusAfter`, and the focus
 * moves to the heading of the section either when the wait ends (the button
 * is still here) or when the button unmounts. The cleanup of a passive effect
 * runs after React removed the button, so `focusIsLost()` is true.
 */
export function ContactAlertCloseButton({ alert, taskId, da }: Props) {
  const sheet = useContactSheet()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const choiceId = React.useId()

  const [open, setOpen] = React.useState(false)
  // None to begin with: the user decides (AC22)
  const [choice, setChoice] = React.useState<ContactState | null>(null)

  // The alert was closed: the focus moves when the refreshed page is on
  // screen, unless the user moved it meanwhile
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
  const removeCallback = useRemoveCallback()

  // The refreshed page without this alert unmounts the button before the wait
  // can end: the cleanup is the only place left to move the focus. The latest
  // `moveFocus` only reads a ref, so the effect runs once.
  React.useEffect(() => moveFocus, [])

  const openDialog = () => {
    if (pending) return
    setChoice(null)
    setOpen(true)
  }

  const confirm = () => {
    if (pending || choice === null) return
    setOpen(false)
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the button unmounted, so the toast and the refresh still run
    removeCallback
      .mutateAsync({ alertId: alert.id, taskId, state: choice })
      .then(
        () => {
          focusAfter.current = true
          finishAfterRefresh()
        },
        (error: ApiFailure) => {
          // The contact is read again and shown as it is: the toast gives the
          // reason, and the toast region is hidden to assistive technology
          // while the sheet is open: say it inside (`onError` returns null:
          // this call asks no confirmation)
          onError(error)
          sheet.announceAlert(describeRejection(error))
          // The refresh `onError` started shows the saved contact
          awaitRefresh()
        }
      )
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Togli il richiamo"
        aria-busy={pending}
        aria-disabled={pending}
        onClick={openDialog}
      >
        {pending ? (
          <LoadingSpinner className="h-4 w-4 shrink-0 motion-reduce:animate-none" />
        ) : (
          <X size={20} aria-hidden="true" />
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            buttonRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Togli il richiamo</DialogTitle>
            {/* The date is the point of the dialog: full text contrast */}
            <DialogDescription className="text-foreground">
              {`Il richiamo del ${formatDateAsDMY(alert.deadline)} verrà chiuso e spostato nello Storico. Scegli il nuovo stato del contatto.`}
            </DialogDescription>
          </DialogHeader>
          {alert.message ? (
            // Scrolls inside the dialog, so a long message never pushes the
            // buttons out; focusable, so the keyboard can scroll it
            <p
              role="region"
              aria-label="Messaggio del richiamo"
              tabIndex={0}
              className="max-h-[40vh] min-w-0 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm [overflow-wrap:anywhere]"
            >
              {alert.message}
            </p>
          ) : null}
          <RadioGroup
            // `undefined` would make the group uncontrolled
            value={choice ?? ""}
            onValueChange={(next) => setChoice(next as ContactState)}
            aria-label="Nuovo stato del contatto"
            className="gap-2"
          >
            {removeCallbackTargets.map((state) => (
              <div key={state} className="flex items-center gap-2">
                <RadioGroupItem id={`${choiceId}-${state}`} value={state} />
                <Label htmlFor={`${choiceId}-${state}`}>
                  {stateLabel(state)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="default"
              disabled={choice === null}
              onClick={confirm}
            >
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
