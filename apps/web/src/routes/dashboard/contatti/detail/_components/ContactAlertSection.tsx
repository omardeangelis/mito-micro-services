import { type ReactNode, useId } from "react"
import { formatDateAsDMY } from "@mito/client/format"
import type { ContactDetail } from "@mito/contract/task"
import { ContactAlertCloseButton } from "./ContactAlertCloseButton"

type ClosedAlert = ContactDetail["history"][number]

const cardClass = "rounded-card border border-border bg-card p-4 shadow-card"

/** "Nome Cognome" of who closed the alert, or `null` when the system did. */
const closedByOf = (entry: ClosedAlert): string | null =>
  [entry.resolvedByName, entry.resolvedBySurname]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || null

/** One closed alert of the Storico: what it said, and who closed it and when. */
function ClosedAlertItem({ entry }: { entry: ClosedAlert }) {
  const closedBy = closedByOf(entry)
  const closedOn = formatDateAsDMY(entry.updatedAt)

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
          ? `Chiuso dal sistema il ${closedOn}`
          : `Chiuso da ${closedBy} il ${closedOn}`}
      </p>
    </li>
  )
}

/**
 * The open alert of the contact (deadline and message) and the Storico of the
 * customer's closed ones, with who closed them and when (AC28). Two regions,
 * each named by its heading. `action` sits at the right of the "Prossimo alert"
 * heading; `canEdit` adds the "X" that closes the open alert (AC29). The
 * heading takes the focus when the alert is closed and "Imposta richiamo" is
 * not there.
 */
export function ContactAlertSection({
  data,
  da,
  action,
  canEdit = false,
}: {
  data: ContactDetail
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
  action?: ReactNode
  canEdit?: boolean
}) {
  const { alert, history } = data
  const openId = useId()
  const historyId = useId()

  return (
    <>
      <section aria-labelledby={openId} className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={openId}
            tabIndex={-1}
            data-alert-section-heading=""
            className="text-base font-medium outline-none"
          >
            Prossimo alert
          </h3>
          {action}
        </div>
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
              <ContactAlertCloseButton alertId={alert.id} da={da} />
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby={historyId} className={cardClass}>
        <h3 id={historyId} className="text-base font-medium">
          Storico
        </h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nessun alert chiuso
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {history.map((entry) => (
              <ClosedAlertItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
