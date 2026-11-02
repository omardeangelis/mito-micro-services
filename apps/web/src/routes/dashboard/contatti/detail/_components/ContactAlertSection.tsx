import { useId } from "react"
import { formatDateAsDMY } from "@mito/client/format"
import { stateLabel } from "@mito/domain/contact/status"
import { romeDay } from "@mito/domain/contact/time"
import type { ContactDetail } from "@mito/contract/task"
import { ContactAlertCloseButton } from "./ContactAlertCloseButton"

type ClosedAlert = ContactDetail["history"][number]
type Closure = ContactDetail["closures"][number]
type Call = ContactDetail["calls"][number]

const cardClass = "rounded-card border border-border bg-card p-4 shadow-card"

/** «gg/mm» and «HH:mm» of an instant in Rome, where the users work */
const romeDayMonth = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
})
const romeTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** «il gg/mm alle HH:mm» of an instant */
const whenOf = (at: Date) =>
  `il ${romeDayMonth.format(at)} alle ${romeTime.format(at)}`

/** "Nome Cognome", the parts that exist, or `null` without any */
const fullName = (name: string | null, surname: string | null) =>
  [name, surname]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || null

/** One entry of the Storico: a call or a closed alert, with its instant */
type Entry =
  | { kind: "call"; at: Date; call: Call }
  | { kind: "closed"; at: Date; alert: ClosedAlert; closure: Closure | null }

/**
 * The calls and the closed alerts, newest first. A call and the closing it
 * made share the instant: the call goes on top (AC16)
 */
const entriesOf = (data: ContactDetail): Entry[] => {
  const closures = new Map(
    data.closures.map((closure) => [closure.alertId, closure])
  )
  const entries: Entry[] = [
    ...data.calls.map((call) => ({ kind: "call" as const, at: call.at, call })),
    ...data.history.map((alert) => {
      const closure = closures.get(alert.id) ?? null
      return {
        kind: "closed" as const,
        at: closure?.closedAt ?? alert.updatedAt,
        alert,
        closure,
      }
    }),
  ]
  return entries.sort(
    (a, b) =>
      b.at.getTime() - a.at.getTime() ||
      (a.kind === b.kind ? 0 : a.kind === "call" ? -1 : 1)
  )
}

/** A call of the Storico: the outcome, and for Richiamare the day (AC30) */
function CallItem({ call }: { call: Call }) {
  const by = fullName(call.operatorName, call.operatorSurname)
  const label = stateLabel(
    call.outcome,
    call.callbackDeadline ? romeDay(call.callbackDeadline) : null
  )
  return (
    <li className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm font-medium">{label}</span>
      <p className="text-xs text-muted-foreground">
        {by === null
          ? `Chiamata ${whenOf(call.at)}`
          : `Chiamata di ${by} ${whenOf(call.at)}`}
      </p>
    </li>
  )
}

/**
 * A closed alert of the Storico: what it said, and who closed it and when
 * (AC23). The conversion, and an alert closed with nobody, is «dal sistema»
 */
function ClosedAlertItem({
  entry,
  closure,
  at,
}: {
  entry: ClosedAlert
  closure: Closure | null
  at: Date
}) {
  const closedBy =
    closure?.resolution === "system"
      ? null
      : fullName(entry.resolvedByName, entry.resolvedBySurname)

  return (
    <li className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{formatDateAsDMY(entry.deadline)}</span>
        {entry.message === null ? null : (
          <span className="min-w-0 break-words">{entry.message}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {closedBy === null
          ? `Chiuso dal sistema ${whenOf(at)}`
          : `Chiuso da ${closedBy} ${whenOf(at)}`}
      </p>
    </li>
  )
}

/**
 * The open alert of the contact (deadline and message) and the Storico of the
 * customer: its calls and its closed alerts, with who and when, newest first
 * (AC28; esiti-richiami-stati AC16, AC23, AC30). Two regions, each named by
 * its heading. `canEdit` adds the "X" of «Togli il richiamo» (AC22). The heading
 * takes the focus when the alert is closed.
 */
export function ContactAlertSection({
  data,
  da,
  canEdit = false,
}: {
  data: ContactDetail
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
  canEdit?: boolean
}) {
  const { alert } = data
  const entries = entriesOf(data)
  const openId = useId()
  const historyId = useId()

  return (
    <>
      <section aria-labelledby={openId} className={cardClass}>
        <h3
          id={openId}
          tabIndex={-1}
          data-alert-section-heading=""
          className="text-base font-medium outline-none"
        >
          Prossimo alert
        </h3>
        {alert === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nessun alert aperto
          </p>
        ) : (
          <div className="mt-2 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">
                {formatDateAsDMY(alert.deadline)}
              </span>
              {alert.message === null ? null : (
                <span className="min-w-0 break-words">{alert.message}</span>
              )}
            </div>
            {canEdit ? (
              <ContactAlertCloseButton
                alert={alert}
                taskId={data.contact.id}
                da={da}
              />
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby={historyId} className={cardClass}>
        <h3 id={historyId} className="text-base font-medium">
          Storico
        </h3>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nessuna chiamata e nessun alert chiuso
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {entries.map((entry) =>
              entry.kind === "call" ? (
                <CallItem key={`call-${entry.call.id}`} call={entry.call} />
              ) : (
                <ClosedAlertItem
                  key={`alert-${entry.alert.id}`}
                  entry={entry.alert}
                  closure={entry.closure}
                  at={entry.at}
                />
              )
            )}
          </ul>
        )}
      </section>
    </>
  )
}
