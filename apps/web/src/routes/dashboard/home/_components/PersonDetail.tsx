import { useId, useState } from "react"
import { Link } from "react-router"
import { defaultState } from "@mito/client/contact/searchParams"
import { type TeamMember } from "@mito/contract/home"
import { romeTime } from "@mito/domain/contact/time"
import { addDays } from "@mito/domain/wave/days"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { customerNameOf } from "@/components/custom/contact/call/customerName"
import { Button } from "@/components/ui/button"
import { useContactLinkClick } from "@/routes/dashboard/contatti/detail/useContactOverlay"
import { listHref } from "@/routes/dashboard/contatti/_lib/listHref"
import { formatNumber } from "../../import/wave/_lib/text"

/** The calls shown before «Mostra tutte» (AC29) */
const CALLS_SHOWN = 8

/**
 * The name of a customer, «Cliente senza nome» without one: a link to the
 * contact, or plain text for a row without one. A plain click opens the
 * contact sheet over the home, with a modifier it is a new tab (AC29).
 */
function CustomerLink({
  taskId,
  name,
}: {
  taskId: number | null
  name: string | null
}) {
  const click = useContactLinkClick()
  const className = "font-label block truncate text-foreground"
  const text = customerNameOf({ name })
  if (taskId === null) return <span className={className}>{text}</span>
  return (
    <Link
      to={`/dashboard/contatti/${taskId}`}
      onClick={(event) => click(taskId, event)}
      className={`${className} hover:underline focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {text}
    </Link>
  )
}

/** A box of the detail: a region named by its `h4` (AC50) */
function Box({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="rounded-card min-w-0 border border-border bg-card"
    >
      <h4 id={id} className="font-label border-b border-border px-4 py-2">
        {title}
      </h4>
      {children}
    </section>
  )
}

function TodayCalls({ member }: { member: TeamMember }) {
  const [all, setAll] = useState(false)
  const { todayCalls } = member
  const shown = all ? todayCalls : todayCalls.slice(0, CALLS_SHOWN)
  const count = formatNumber(todayCalls.length)
  return (
    <Box title={`Chiamate di oggi · ${count}`}>
      {todayCalls.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {member.name.split(" ")[0]} non ha ancora registrato chiamate oggi.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((call) => (
              <li
                key={call.id}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-2 text-sm"
              >
                <span className="tabular-nums text-muted-foreground">
                  {romeTime(call.at)}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <CustomerLink taskId={call.taskId} name={call.name} />
                  {call.outcome === null ? null : (
                    <TaskStatusBadge status={call.outcome} />
                  )}
                </div>
                {call.message === null ? null : (
                  <p className="col-start-2 min-w-0 break-words text-muted-foreground">
                    {call.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {todayCalls.length > CALLS_SHOWN ? (
            <div className="border-t border-border px-4 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={all}
                onClick={() => setAll((current) => !current)}
              >
                {all ? "Mostra solo le ultime" : `Mostra tutte le ${count}`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Box>
  )
}

/** «da ieri», «da 9 giorni» */
const lateText = (days: number) =>
  days === 1 ? "da ieri" : `da ${days} giorni`

function Overdue({ member, today }: { member: TeamMember; today: string }) {
  const { total, rows } = member.overdue
  const all = listHref({
    ...defaultState,
    operatorIds: [member.operatorId],
    hasAlert: true,
    dateField: "nextAlert",
    to: addDays(today, -1),
    orderBy: "nextAlert",
    sortedBy: "asc",
  })
  return (
    <Box title={`Arretrati · ${formatNumber(total)}, dal più vecchio`}>
      {total === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Nessun richiamo scaduto.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.taskId}
                className="flex items-start justify-between gap-3 px-4 py-2 text-sm"
              >
                <div className="min-w-0">
                  <CustomerLink taskId={row.taskId} name={row.name} />
                  <p className="min-w-0 break-words text-muted-foreground">
                    {row.triedAt
                      ? `Tentato alle ${romeTime(row.triedAt)}`
                      : (row.message ?? "Nessun messaggio")}
                  </p>
                </div>
                <span className="text-destructive-text shrink-0 whitespace-nowrap">
                  {lateText(row.daysLate)}
                </span>
              </li>
            ))}
          </ul>
          {total > rows.length && total > 6 ? (
            <div className="border-t border-border px-4 py-2 text-sm">
              <Link
                to={all}
                className="text-link underline-offset-3 font-medium hover:underline"
              >
                {`Vedi tutti i ${formatNumber(total)} in Contatti`}
              </Link>
            </div>
          ) : null}
        </>
      )}
    </Box>
  )
}

/**
 * The detail of a person (AC29): today's calls and the overdue callbacks side
 * by side, in a column when the container is narrow. `today` is the server's
 * (D11).
 */
export function PersonDetail({
  member,
  today,
}: {
  member: TeamMember
  today: string
}) {
  return (
    <div className="@[50rem]:grid-cols-2 @[50rem]:items-start grid grid-cols-1 gap-3 p-4">
      <TodayCalls member={member} />
      <Overdue member={member} today={today} />
    </div>
  )
}
