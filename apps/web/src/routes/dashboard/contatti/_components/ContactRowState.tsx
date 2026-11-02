import * as React from "react"
import { format } from "date-fns"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import { CallbackPanel } from "@/components/custom/contact/call/CallOutcomes"
import { ContactStateSelect } from "@/components/custom/contact/ContactStateSelect"
import { ReadOnlyReason } from "@/components/custom/contact/ReadOnlyReason"
import { useActor } from "@/components/custom/contact/useActor"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useRowFocusAfterSave } from "@/components/custom/contact/useRowFocusAfterSave"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"
import { contactEditability } from "@mito/domain/contact/permissions"
import {
  type CallOutcome,
  needsConfirmation,
} from "@mito/domain/contact/outcome"
import {
  callableStates,
  stateLabel,
  toContactState,
} from "@mito/domain/contact/status"
import { romeDay } from "@mito/domain/contact/time"
import { type ContactRow, type TaskStatus } from "@mito/contract/task"
import { type ApiFailure, describeApiError } from "@/api/errors"
import {
  type RegisterCallInput,
  useChangeState,
  useRegisterCall,
} from "@/api/task"
import { customerNameOf } from "../_lib/customerName"
import {
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useRowChanged } from "./rowChange"

/** The text of an outcome nobody can tell (AC15) */
const UNCERTAIN =
  "Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo."

/** A press of an outcome, before the confirmation of a future alert */
type Press = {
  outcome: CallOutcome
  callbackOn: Date | undefined
  message: string | undefined
}

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
 * - The menu also offers the four outcomes of «Registra chiamata» (AC18),
 *   for a state a call can be registered on (AC12), with the rules of the
 *   detail's `ContactCallSection`: the alert shown is `workingAlertId` (AC13),
 *   a future one asks first (AC14: the modal, or «Sostituisce il richiamo del
 *   gg/mm» in the panel of Richiamare, anchored to the cell, where saving is
 *   the confirmation), no outcome sends while one is pending (AC33), a
 *   rejection or an uncertain outcome (AC15) is a toast, and the panel keeps
 *   its draft and says the reason.
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
  // The day of the open alert: a Richiamo shows it (AC1)
  const alertDay = contact.alert ? romeDay(contact.alert.deadline) : null

  const registerCall = useRegisterCall()
  // The outcome being sent; the ref locks a second press in the same tick
  const [sendingOutcome, setSendingOutcome] =
    React.useState<CallOutcome | null>(null)
  const sending = React.useRef(false)
  // The panel of Richiamare, and the reason of its last failure
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [panelError, setPanelError] = React.useState<string | null>(null)
  // The press waiting for the confirmation of a future alert (AC14)
  const [callConfirmation, setCallConfirmation] = React.useState<{
    press: Press
    alert: PendingAlert
  } | null>(null)
  // The future alert the server said is open (case 7): Richiamare replaces it
  const [current, setCurrent] = React.useState<PendingAlert | null>(null)
  const futureAlert =
    contact.alert !== null &&
    needsConfirmation(
      { day: romeDay(contact.alert.deadline) },
      romeDay(new Date())
    )
      ? contact.alert
      : null
  const replaced = current ?? futureAlert

  const sendCall = (press: Press, confirmedAlertId: number | undefined) => {
    if (sending.current) return
    sending.current = true
    setSendingOutcome(press.outcome)
    setPanelError(null)
    remember()
    start()
    const common = {
      taskId: contact.id,
      source: "list" as const,
      workingAlertId: contact.alert?.id,
      confirmedAlertId,
    }
    const input: RegisterCallInput =
      press.outcome === "richiamare"
        ? {
            ...common,
            outcome: "richiamare",
            callback: {
              day: format(press.callbackOn!, "yyyy-MM-dd"),
              message: press.message ?? null,
            },
          }
        : { ...common, outcome: press.outcome }

    // `mutateAsync` resolves also after the row unmounted (a row that leaves
    // the filters does), and never rejects
    void registerCall.mutateAsync(input).then((result) => {
      sending.current = false
      setSendingOutcome(null)
      if (result.kind === "registered") {
        setCurrent(null)
        // Before the refresh: the table looks for the row in what it brings
        rowChanged(contact.id, customerName)
        toast("", {
          duration: 5000,
          description: `${customerName}: ${stateLabel(result.registered.state)}`,
        })
        finishAfterRefresh()
        return
      }
      if (result.kind === "uncertain") {
        // Not said as «not registered»: the contact is read again (AC15)
        toast.error("", { duration: 8000, description: UNCERTAIN })
        if (press.outcome === "richiamare") setPanelError(UNCERTAIN)
        refresh()
        awaitRefresh()
        return
      }
      const { error } = result
      if (error._tag === "AlertConfirmationRequired") {
        // A future alert is open that the user didn't confirm (case 7): the
        // row is read again and its confirmation asked (AC14). The panel of
        // Richiamare stays open and names it at once
        refresh()
        awaitRefresh()
        if (press.outcome === "richiamare") {
          setCurrent(error.alert)
          setPanelError(describeApiError(error))
        } else {
          forget()
          setCallConfirmation({ press, alert: error.alert })
        }
        return
      }
      onError(error)
      awaitRefresh()
      // The panel stays open with the draft and the reason
      if (press.outcome === "richiamare") setPanelError(describeApiError(error))
    })
  }

  const onOutcome = (outcome: CallOutcome) => {
    if (pending || sending.current) return
    if (outcome === "richiamare") {
      setPanelOpen(true)
      return
    }
    const press = { outcome, callbackOn: undefined, message: undefined }
    if (outcome !== "non risponde" && futureAlert !== null) {
      setCallConfirmation({ press, alert: futureAlert })
      return
    }
    sendCall(press, undefined)
  }

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
          // A reopening is a new contact (AC34): the way to it. The link
          // closes the toast on a plain click, so it reads the id of the
          // call that shows it
          const href = result.reopened ? detailHref(result.taskId, state) : null
          const id = toast("", {
            duration: result.reopened ? 8000 : 5000,
            description: `${customerName}: ${stateLabel(toState)}`,
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
                      Apri
                    </a>
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
      return (
        <TaskStatusBadge
          status={contact.state ?? "nessuno"}
          alertDay={alertDay}
        />
      )
    }
    if (nested) {
      return (
        <TaskStatusBadge
          status={contact.state ?? "nessuno"}
          alertDay={alertDay}
        />
      )
    }
    if (editability.kind !== "editable") {
      return (
        <div className="flex flex-col items-center gap-1">
          <TaskStatusBadge
            status={contact.state ?? "nessuno"}
            alertDay={alertDay}
          />
          <ReadOnlyReason editability={editability} />
        </div>
      )
    }

    const callable = (callableStates as readonly string[]).includes(
      toContactState(contact.state)
    )

    const select = (
      <ContactStateSelect
        value={contact.state}
        alertDay={alertDay}
        pending={pending}
        triggerRef={triggerRef}
        describedBy={describedBy}
        onChange={(toState) => {
          if (pending) return
          submitState(toState, null)
        }}
        onOutcome={callable ? onOutcome : undefined}
      />
    )

    return (
      <>
        {callable ? (
          <CallbackPanel
            customer={customerName}
            now={new Date()}
            pending={sendingOutcome === "richiamare"}
            disabled={pending}
            replacesAlertDay={replaced ? romeDay(replaced.deadline) : null}
            error={panelError}
            open={panelOpen}
            onOpenChange={setPanelOpen}
            onSave={(day, message) => {
              if (pending || sending.current) return
              // Saving the panel that names the alert is the confirmation
              sendCall(
                { outcome: "richiamare", callbackOn: day, message },
                replaced?.id
              )
            }}
          >
            <div className="w-full">{select}</div>
          </CallbackPanel>
        ) : (
          select
        )}
        <AlertCloseConfirmDialog
          alert={callConfirmation?.alert ?? null}
          returnFocusRef={triggerRef}
          onCancel={() => setCallConfirmation(null)}
          onConfirm={(alertId) => {
            if (!callConfirmation) return
            const { press } = callConfirmation
            setCallConfirmation(null)
            sendCall(press, alertId)
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
