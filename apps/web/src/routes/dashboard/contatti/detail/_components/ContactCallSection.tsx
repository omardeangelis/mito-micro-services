import * as React from "react"
import { format } from "date-fns"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import {
  CallOutcomes,
  type OnOutcome,
} from "@/components/custom/contact/call/CallOutcomes"
import { focusIsLost } from "@/components/custom/contact/focus"
import { type PendingAlert } from "@/components/custom/contact/useContactMutationFeedback"
import { useRefreshAfterSave } from "@/components/custom/contact/useRefreshAfterSave"
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
import type { ContactDetail } from "@mito/contract/task"
import { describeApiError } from "@/api/errors"
import { type RegisterCallInput, useRegisterCall } from "@/api/task"
import { useContactSheet } from "./ContactSheet"

/** The text of an outcome nobody can tell (AC15) */
const UNCERTAIN =
  "Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo."

const cardClass = "rounded-card border border-border bg-card p-4 shadow-card"

/** "Nome Cognome", the parts that exist: the name the outcomes speak of */
const customerNameOf = (customer: ContactDetail["customer"]) =>
  [customer.name, customer.surname]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || "Cliente senza nome"

/** A press of an outcome, before the confirmation of a future alert */
type Press = {
  outcome: CallOutcome
  callbackOn: Date | undefined
  message: string | undefined
}

/**
 * «Registra chiamata» in the detail (esiti-richiami-stati AC7, AC12–AC16,
 * AC33): the four outcomes of the home, for a user who can edit the active
 * contact. Every send says the open alert shown (`workingAlertId`, AC13).
 *
 * - A state that allows no call says so in place of the outcomes (AC12).
 * - A future open alert asks first: the dialog of the state change for
 *   Appuntamento and Non interessato, the line «Sostituisce il richiamo del
 *   gg/mm» of the panel for Richiamare, where saving is the confirmation
 *   (AC14). Both send the alert as `confirmedAlertId`.
 * - During the send the pressed button says «Registro…» and no outcome sends
 *   (AC33); the lock ends with the answer.
 * - A rejection is said with the labels (AC15), in the section and to
 *   assistive technology; the panel of Richiamare stays open while it saves
 *   and, after a rejection or an uncertain outcome, with the draft and the
 *   reason (home-operatore AC20). A future alert set meanwhile (case 7) reads the
 *   contact again, then asks the confirmation of that alert (AC14).
 * - An uncertain outcome says so, and the contact is read again (AC15).
 *
 * The contact is read again when the call ends, whatever the outcome
 * (`useRegisterCall`): the state, the alert and the Storico (AC16).
 */
export function ContactCallSection({ data }: { data: ContactDetail }) {
  const sheet = useContactSheet()
  const registerCall = useRegisterCall()
  const { refresh } = useRefreshAfterSave()
  const headingId = React.useId()
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  // The outcome being sent; the ref locks a second press in the same tick
  const [pending, setPending] = React.useState<CallOutcome | null>(null)
  const sending = React.useRef(false)
  // The reason of the last failure, in the section
  const [notice, setNotice] = React.useState<string | null>(null)
  // The reason of a failed Richiamare, in its panel with the draft
  const [panelError, setPanelError] = React.useState<string | null>(null)
  // The press waiting for the confirmation of a future alert (AC14)
  const [confirmation, setConfirmation] = React.useState<{
    press: Press
    alert: PendingAlert
  } | null>(null)
  // The future alert the server said is open (case 7), until the next send:
  // Richiamare replaces it
  const [current, setCurrent] = React.useState<PendingAlert | null>(null)
  // After an answer the focus, if it was lost, goes to the heading
  const refocus = React.useRef(false)

  React.useEffect(() => {
    if (pending !== null || !refocus.current) return
    refocus.current = false
    if (focusIsLost()) headingRef.current?.focus()
  }, [pending])

  const now = new Date()
  const today = romeDay(now)
  const { contact, alert } = data
  const futureAlert =
    alert !== null && needsConfirmation({ day: romeDay(alert.deadline) }, today)
      ? alert
      : null
  // The future alert Richiamare replaces: the one the server named, or the
  // one shown
  const replaced = current ?? futureAlert

  const send = (press: Press, confirmedAlertId: number | undefined) => {
    if (sending.current) return
    sending.current = true
    setPending(press.outcome)
    setNotice(null)
    setPanelError(null)
    const common = {
      taskId: contact.id,
      source: "detail" as const,
      workingAlertId: alert?.id,
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

    // `mutateAsync` resolves also after an unmount; it never rejects
    void registerCall.mutateAsync(input).then((result) => {
      sending.current = false
      refocus.current = true
      setPending(null)
      if (result.kind === "registered") {
        setCurrent(null)
        return
      }
      if (result.kind === "uncertain") {
        sheet.announceAlert(UNCERTAIN)
        if (press.outcome === "richiamare") setPanelError(UNCERTAIN)
        else setNotice(UNCERTAIN)
        return
      }
      const { error } = result
      const text = describeApiError(error)
      if (error._tag === "AlertConfirmationRequired") {
        // A future alert is open that the user didn't confirm (case 7): the
        // contact is read again and its confirmation asked (AC14). The panel
        // of Richiamare stays open with the draft and names it at once
        if (press.outcome === "richiamare") {
          setCurrent(error.alert)
          sheet.announceAlert(text)
          setPanelError(text)
          refresh()
          return
        }
        refocus.current = false
        refresh(async () => setConfirmation({ press, alert: error.alert }))
        return
      }
      sheet.announceAlert(text)
      if (press.outcome === "richiamare") {
        // The panel stays open with the draft and the reason (home-operatore
        // AC20); a reason that takes the outcomes away is said in the
        // section too, where it stays once the contact is read again
        setPanelError(text)
        if (
          error._tag === "DeadlineInPast" ||
          error._tag === "MessageTooLong" ||
          error._tag === "RequestIdConflict"
        ) {
          return
        }
      }
      setNotice(text)
    })
  }

  const onOutcome: OnOutcome = (outcome, callbackOn, message) => {
    if (sending.current) return
    const press = { outcome, callbackOn, message }
    if (outcome === "richiamare") {
      if (!callbackOn) return
      // Saving the panel that names the alert is the confirmation (AC14)
      send(press, replaced?.id)
      return
    }
    if (outcome !== "non risponde" && futureAlert !== null) {
      setConfirmation({ press, alert: futureAlert })
      return
    }
    send(press, undefined)
  }

  const callable = (callableStates as readonly string[]).includes(
    toContactState(contact.state)
  )

  return (
    <section aria-labelledby={headingId} className={`${cardClass} @container`}>
      <h3
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-medium outline-none"
      >
        Registra chiamata
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {callable ? (
          <CallOutcomes
            customer={customerNameOf(data.customer)}
            now={now}
            onOutcome={onOutcome}
            pending={pending}
            replacesAlertDay={replaced ? romeDay(replaced.deadline) : null}
            error={panelError}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {`Con lo stato ${stateLabel(contact.state)} non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo.`}
          </p>
        )}
        {notice === null ? null : (
          <p className="text-destructive-text text-sm">{notice}</p>
        )}
      </div>
      <AlertCloseConfirmDialog
        alert={confirmation?.alert ?? null}
        returnFocusRef={headingRef}
        onCancel={() => setConfirmation(null)}
        onConfirm={(alertId) => {
          if (!confirmation) return
          setConfirmation(null)
          send(confirmation.press, alertId)
        }}
      />
    </section>
  )
}
