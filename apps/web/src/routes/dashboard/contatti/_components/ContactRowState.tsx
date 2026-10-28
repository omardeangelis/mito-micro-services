import * as React from "react"
import { useNavigate } from "react-router"

import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import { ContactStateSelect } from "@/components/custom/contact/ContactStateSelect"
import { ReadOnlyReason } from "@/components/custom/contact/ReadOnlyReason"
import { useActor } from "@/components/custom/contact/useActor"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useRowFocusAfterSave } from "@/components/custom/contact/useRowFocusAfterSave"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"
import { contactEditability } from "@mito/domain/contact/permissions"
import { type ContactRow, type TaskStatus } from "@mito/contract/task"
import { type ApiFailure } from "@/api/errors"
import { useChangeState } from "@/api/task"
import { customerNameOf } from "../_lib/customerName"
import {
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useRowChanged } from "./rowChange"

type Props = {
  contact: ContactRow
  /** The state of the list: the links to a contact carry it along */
  state: ContactsListState
  /** The id of the customer cell of the row: the selector is described by it */
  describedBy: string
  /**
   * A previous contact shown under the active one: that it is concluded is
   * known by where it is, so it has no "Concluso" of its own
   */
  nested?: boolean
}

/**
 * The "Stato" cell of a row: the state of the contact, changed in place with
 * the rules of the detail (AC9, AC30–AC41), the source `list`, and the same
 * select and wait as the detail's `ContactStateControl`.
 *
 * - The saved value is always on screen; the wait is the spinner of the
 *   selector, from the call until the new value is rendered (AC39). A change
 *   to a state that is not selectable is never offered (AC40).
 * - An open alert asks for a confirmation first (AC36, AC37).
 * - A contact that is not the active one (AC3), or that the user may not edit
 *   (AC51), shows its state and the reason, no selector; under the active one
 *   (`nested`) it shows the state alone.
 * - A rejection is a toast with the reason, the offer of the active contact
 *   when it was superseded (AC49, AC52), and the refresh that brings the
 *   control back to the saved value.
 * - A saved change is a toast with the customer's name (A9). The filters may
 *   take the row away: the table is told before the refresh, to say it aloud.
 */
export function ContactRowState({
  contact,
  state,
  describedBy,
  nested = false,
}: Props) {
  const actor = useActor()
  const { toast } = useToast()
  const rowChanged = useRowChanged()

  const cellRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const { remember, forget, settle } = useRowFocusAfterSave(cellRef)

  // From the call until the refreshed row is rendered
  const { pending, start, fail, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed(settle)
  const activeContactHref = React.useCallback(
    (activeTaskId: number) => detailHref(activeTaskId, state),
    [state]
  )
  const { onError } = useContactMutationFeedback({ refresh, activeContactHref })
  const changeState = useChangeState()
  // The toast is outside the routes: its link navigates with this router
  const navigate = useNavigate()

  // The change waiting for the user to confirm closing the open alert (AC36)
  const [confirmation, setConfirmation] = React.useState<{
    state: TaskStatus
    alert: PendingAlert
  } | null>(null)

  const customerName = customerNameOf(contact.customer)

  const submitState = (
    toState: TaskStatus,
    confirmedAlertId: number | null
  ) => {
    remember()
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the row unmounted (a row that leaves the filters does), so the
    // toast and the refresh still run
    changeState
      .mutateAsync({
        taskId: contact.id,
        toState,
        source: "list",
        confirmedAlertId,
      })
      .then(
        (result) => {
          // Before the refresh: the table looks for the row in what it brings
          rowChanged(contact.id, customerName)
          // The link prevents the default of its click, which Radix reads
          // as "keep the toast": the link closes it itself
          const shown = toast({
            type: "background",
            duration: result.reopened ? 8000 : 5000,
            description: `${customerName}: ${toState}`,
            // A reopening is a new contact (AC34): the way to it
            ...(result.reopened
              ? {
                  action: (
                    <ToastAction
                      // Radix keeps it in an attribute, which the Sentry
                      // Replay does not mask: the name is in the description
                      altText="Apri il contatto riaperto"
                      asChild
                    >
                      <a
                        href={detailHref(result.taskId, state)}
                        onClick={navigateOnPlainClick(
                          (href) => {
                            shown.dismiss()
                            void navigate(href, { preventScrollReset: true })
                          },
                          detailHref(result.taskId, state)
                        )}
                      >
                        Apri
                      </a>
                    </ToastAction>
                  ),
                }
              : {}),
          })
          finishAfterRefresh()
        },
        (error: ApiFailure) => {
          const rejected = onError(error)
          if (rejected) {
            // An open alert to confirm (AC36), maybe set meanwhile by a
            // colleague (AC37): nothing changed, the modal asks
            fail()
            forget()
            setConfirmation({ state: toState, alert: rejected.alert })
            return
          }
          // The toast gives the reason, the refresh shows the saved value
          awaitRefresh()
        }
      )
  }

  // Until the signed-in user is known nothing is interactive
  const editability = actor
    ? contactEditability(actor, {
        isActive: contact.isActive,
        taskOperator: contact.operator,
        customer: { operatorId: contact.customer.operatorId },
      })
    : null

  const content = () => {
    if (editability === null) {
      return <TaskStatusBadge status={contact.state ?? "nessuno"} />
    }
    if (nested) return <TaskStatusBadge status={contact.state ?? "nessuno"} />
    if (editability.kind !== "editable") {
      return (
        <div className="flex flex-col items-center gap-1">
          <TaskStatusBadge status={contact.state ?? "nessuno"} />
          <ReadOnlyReason editability={editability} />
        </div>
      )
    }

    return (
      <>
        <ContactStateSelect
          value={contact.state}
          pending={pending}
          triggerRef={triggerRef}
          describedBy={describedBy}
          onChange={(toState) => {
            if (pending) return
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

  return (
    <div
      ref={cellRef}
      className="flex w-40 items-center justify-center"
      // The menu and the modal are portals, but React bubbles their clicks
      // through this cell to the row, which would open the contact. Only with
      // the selector: a read-only cell is still part of the row
      onClick={
        editability?.kind === "editable"
          ? (event) => event.stopPropagation()
          : undefined
      }
    >
      {content()}
    </div>
  )
}
