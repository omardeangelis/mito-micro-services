import * as React from "react"
import { useNavigate } from "react-router"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import { ContactStateSelect } from "@/components/custom/contact/ContactStateSelect"
import {
  describeRejection,
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { type TaskStatus } from "@mito/domain/schemas"
import { type ApiFailure } from "@/api/errors"
import { useChangeState } from "@/api/task"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { useContactSheet } from "./ContactSheet"

type Props = {
  taskId: number
  /** The saved state: the control shows it until the new one is on screen */
  state: TaskStatus | null
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * The state of the contact in the detail (AC30–AC40): the same select and wait
 * as the list row (`ContactRowState`), with the source `detail`.
 *
 * - The saved value is always on screen; the wait is the spinner of the
 *   selector, from the call until the new value is rendered. A second change is
 *   not sent meanwhile (AC39).
 * - An open alert, also one set meanwhile by a colleague, asks for a
 *   confirmation first (AC36, AC37): the server answers
 *   ALERT_CONFIRMATION_REQUIRED and the modal asks.
 * - Going back to `chiamare` from an outcome reopens the contact (AC34): the
 *   server answers with the new contact, and the address is *replaced* with
 *   its address, so "Indietro" doesn't lead back to the superseded one (AC35),
 *   and the contacts are read again, so the list is not the old one. The
 *   shell doesn't remount on a change of id: the control stays pending, the
 *   old content stays on screen, and the content of the new contact replaces
 *   it when it is read. If the sheet closed, or started to close, meanwhile,
 *   the contacts are only read again; and the sheet doesn't close while the
 *   replace navigates.
 * - A rejection (AC49, AC52) is a toast, said also inside the sheet, and the
 *   refresh that brings the control back to the saved value.
 */
export function ContactStateControl({ taskId, state, da }: Props) {
  const navigate = useNavigate()
  const sheet = useContactSheet()
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  // From the call until the refreshed page is rendered
  const { pending, start, fail, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed()
  // The replace to the reopened contact: its content is not here until it ends
  const [navigating, setNavigating] = React.useState(false)
  // The answer may come after the sheet closed or moved to another contact:
  // then this control must not navigate
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // The sheet waits for the replace to end before it closes: two navigations
  // at once, the second discards the first
  React.useEffect(() => {
    sheet.setReopening(navigating)
    return () => sheet.setReopening(false)
  }, [navigating, sheet])

  const activeContactHref = React.useCallback(
    (activeTaskId: number) => detailHrefFromDa(activeTaskId, da),
    [da]
  )
  const { onError } = useContactMutationFeedback({ refresh, activeContactHref })
  const changeState = useChangeState()

  // The change waiting for the user to confirm closing the open alert (AC36)
  const [confirmation, setConfirmation] = React.useState<{
    state: TaskStatus
    alert: PendingAlert
  } | null>(null)

  // After a reopening, or "Vai al contatto attivo", the selector of the
  // contact that mounts takes the focus
  React.useEffect(() => {
    if (sheet.consumeStateTriggerFocus()) triggerRef.current?.focus()
    // Once, when the control mounts: the flag is taken, not watched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitState = (
    toState: TaskStatus,
    confirmedAlertId: number | null
  ) => {
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the control unmounted, so the toast and the refresh still run
    changeState
      .mutateAsync({ taskId, toState, source: "detail", confirmedAlertId })
      .then(
        (result) => {
          if (!result.reopened) {
            finishAfterRefresh()
            return
          }
          if (!mounted.current || sheet.isClosing()) {
            // Nobody to take to the new contact (the sheet closed, or is
            // closing: its navigation would be discarded by the replace and
            // the sheet would stay open): the list under it shows the new
            // contact once refreshed
            refresh()
            return
          }
          // `taskId` is the new contact. The control stays pending: `start()`
          // is not undone, the content that replaces this one unmounts it.
          // `replace`, never `push`
          sheet.announce(
            "Contatto riaperto. Il precedente resta tra i contatti precedenti"
          )
          sheet.focusStateTriggerOnNextMount()
          // Before the transition starts, so there is no gap for a close
          sheet.setReopening(true)
          setNavigating(true)
          // The list and the contacts the sheet read hold the superseded
          // contact as an active one: "Indietro" and Esc would show it. They
          // are read again (AC2, AC3, AC35); the new contact is read by the
          // page it navigates to
          refresh()
          // The data router answers with a promise, the end of the navigation
          void Promise.resolve(
            navigate(detailHrefFromDa(result.taskId, da), {
              replace: true,
              preventScrollReset: true,
            })
          ).finally(() => {
            if (mounted.current) setNavigating(false)
          })
        },
        (error: ApiFailure) => {
          const rejected = onError(error)
          if (rejected) {
            // An open alert to confirm (AC36), maybe set meanwhile by a
            // colleague (AC37): nothing changed, the modal asks
            fail()
            setConfirmation({ state: toState, alert: rejected.alert })
            return
          }
          // The toast gives the reason, and the toast region is hidden to
          // assistive technology while the sheet is open: say it inside
          sheet.announceAlert(describeRejection(error))
          // The refresh `onError` started shows the saved value
          awaitRefresh()
        }
      )
  }

  const busy = pending || navigating

  return (
    <>
      <ContactStateSelect
        value={state}
        pending={busy}
        triggerRef={triggerRef}
        onChange={(toState) => {
          if (busy) return
          submitState(toState, null)
        }}
      />
      <AlertCloseConfirmDialog
        alert={confirmation?.alert ?? null}
        returnFocusRef={triggerRef}
        onCancel={() => setConfirmation(null)}
        onConfirm={(alertId) => {
          if (!confirmation) return
          setConfirmation(null)
          submitState(confirmation.state, alertId)
        }}
      />
    </>
  )
}
