import { Check } from "lucide-react"
import { memo, useState } from "react"
import { Link } from "react-router"
import { type CallOutcome } from "@mito/domain/contact/outcome"
import { CallOutcomes } from "@/components/custom/contact/call/CallOutcomes"
import { customerNameOf } from "@/components/custom/contact/call/customerName"
import { StateBadge } from "@/components/custom/contact/call/StateBadge"
import { type Register } from "../_hooks/useCallbackQueue"
import { useContactLinkClick } from "../_hooks/useContactOverlay"
import { registeredText, triedText } from "../_lib/format"
import { type QueueClosure, type QueueRow } from "../_lib/queue"
import { workedText } from "../_lib/rejection"
import { DueMarker } from "./DueMarker"

/**
 * The name, a link to the contact, over «<telefono> · <messaggio>» cut to one
 * line (AC15, AC16, D19). The whole message is the description of the link, by
 * the span that is always in the document, the `title` of the line, and a box
 * only the link with the focus mounts, hidden from a screen reader that hears
 * it as the description (AC50)
 */
function CustomerCell({ row }: { row: QueueRow }) {
  const [focused, setFocused] = useState(false)
  const openContact = useContactLinkClick()
  const phone = row.phoneNumber?.trim()
  const message = row.message?.trim() ?? ""
  const messageId = `callback-message-${row.alertId}`
  return (
    <td className="px-5 py-2.5">
      <div className="relative">
        <Link
          to={`/dashboard/contatti/${row.taskId}`}
          data-callback-link={row.alertId}
          onClick={(event) => openContact(row.taskId, event)}
          aria-describedby={message === "" ? undefined : messageId}
          className="font-label block truncate text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {customerNameOf(row)}
        </Link>
        {/* `data-sentry-element`: without it the `title` ends up in the
            breadcrumbs of Sentry and in Replay */}
        <span
          className="block truncate text-muted-foreground"
          title={message === "" ? undefined : message}
          data-sentry-element="callback-message"
        >
          {phone ? (
            <>
              <span className="tabular-nums">{phone}</span>
              {" · "}
            </>
          ) : null}
          <span id={messageId}>
            {message === "" ? "Nessun messaggio" : message}
          </span>
        </span>
        {focused && message !== "" ? (
          <span
            aria-hidden
            className="bg-tooltip text-tooltip-foreground absolute left-0 top-full z-10 mt-1 w-max max-w-md whitespace-normal break-words rounded-md px-3 py-1.5 text-xs"
          >
            {message}
          </span>
        ) : null}
      </div>
    </td>
  )
}

/** What a closed row says in place of the outcomes (AC23) */
const closedText = (closure: QueueClosure) => {
  switch (closure.kind) {
    case "registered":
      return registeredText(closure)
    case "gone":
      return "Non è più fra i tuoi richiami"
    case "worked":
      return workedText(closure)
  }
}

/**
 * A row of «Richiami da fare». The queue keeps the same object for a row that
 * doesn't change, and `pending` and `register` don't change for the other
 * rows, so with `now` stable a change doesn't draw them. The outcomes keep
 * their place under the closed line, hidden, so the row keeps its height and
 * nothing moves under the pointer (AC23). Their `key` changes only as the row
 * closes: that closes the panel, which keeps its draft in any other case
 * (AC20, AC21)
 */
export const CallbackRow = memo(function CallbackRow({
  row,
  now,
  pending,
  failure,
  register,
}: {
  row: QueueRow
  now: Date
  pending: CallOutcome | null
  /** The last Richiamare refused: the text under the calendar, or `true` */
  failure: string | true | null
  register: Register
}) {
  const { closure } = row
  const closed = closure !== null
  const text = closure === null ? null : closedText(closure)
  return (
    <tr className="border-b border-border align-middle last:border-b-0">
      <CustomerCell row={row} />
      <td className="px-2 py-2.5">
        <DueMarker daysLate={row.daysLate} />
      </td>
      <td className="px-2 py-2.5">
        {/* The second line is always there, so the row stays as tall after a
            Non risponde adds «tentato» and nothing moves under the pointer */}
        <div className="flex flex-col items-start gap-0.5">
          <StateBadge
            state={row.state}
            alertDay={
              closure?.kind === "registered" ? closure.callbackDay : undefined
            }
          />
          <span
            className="text-xs text-muted-foreground"
            aria-hidden={row.triedAt ? undefined : true}
          >
            {row.triedAt ? triedText(row.triedAt, now) : "\u00a0"}
          </span>
        </div>
      </td>
      <td className="@min-[63rem]:px-5 px-3 py-2.5">
        <div className="grid">
          {/* Not the class `invisible`: Tab must skip them without the CSS */}
          <div
            className="[grid-area:1/1]"
            style={closed ? { visibility: "hidden" } : undefined}
          >
            <CallOutcomes
              key={closed ? "closed" : "open"}
              customer={customerNameOf(row)}
              now={now}
              onOutcome={(outcome, day, message) =>
                register(row, outcome, day, message)
              }
              pending={pending}
              failed={failure !== null}
              error={typeof failure === "string" ? failure : null}
              controlId={String(row.alertId)}
              keepPressedFocus
              askDayOnEnter
            />
          </div>
          {text === null ? null : (
            <p className="flex items-center gap-1.5 self-center text-muted-foreground [grid-area:1/1]">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {text}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
})
