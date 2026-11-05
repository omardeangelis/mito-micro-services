import { Link } from "react-router"
import { type MyCall } from "@mito/contract/home"
import { romeTime } from "@mito/domain/contact/time"
import { StateBadge } from "@/components/custom/contact/call/StateBadge"
import { customerNameOf } from "@/components/custom/contact/call/customerName"
import { useContactLinkClick } from "../_hooks/useContactOverlay"

/** The name of the customer, a link to the contact; an old row has no task */
function CustomerLink({ call }: { call: MyCall }) {
  const openContact = useContactLinkClick()
  const name = customerNameOf(call)
  const className = "font-label block truncate text-foreground"
  const { taskId } = call
  if (taskId === null) return <span className={className}>{name}</span>
  return (
    <Link
      to={`/dashboard/contatti/${taskId}`}
      onClick={(event) => openContact(taskId, event)}
      className={`${className} hover:underline focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {name}
    </Link>
  )
}

/** Today's calls as they come, newest first: time, client, outcome, message, source */
export function DiaryTable({ calls }: { calls: readonly MyCall[] }) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-20" />
        <col className="w-[18rem]" />
        <col className="w-40" />
        <col />
        <col className="w-36" />
      </colgroup>
      <thead className="text-left text-xs text-muted-foreground">
        <tr className="border-b border-border">
          <th className="font-label px-5 py-2">Ora</th>
          <th className="font-label px-2 py-2">Cliente</th>
          <th className="font-label px-2 py-2">Esito</th>
          <th className="font-label px-2 py-2">Messaggio</th>
          <th className="font-label px-5 py-2">Origine</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => (
          <tr
            key={call.id}
            className="border-b border-border align-middle last:border-b-0"
          >
            <td className="px-5 py-2 tabular-nums text-muted-foreground">
              {romeTime(call.at)}
            </td>
            <td className="px-2 py-2">
              <CustomerLink call={call} />
              <span className="block tabular-nums text-muted-foreground">
                {call.phoneNumber}
              </span>
            </td>
            <td className="px-2 py-2">
              <StateBadge state={call.outcome} alertDay={call.callbackDay} />
            </td>
            {/* `data-sentry-element`: without it the `title` ends up in the
                breadcrumbs of Sentry and in Replay */}
            <td
              className="truncate px-2 py-2 text-muted-foreground"
              title={call.message ?? undefined}
              data-sentry-element="diary-message"
            >
              {call.message ?? ""}
            </td>
            <td className="px-5 py-2 text-muted-foreground">
              {call.origin === "alert" ? "Da un alert" : "Dalla lista"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
