import { type UseQueryResult } from "@tanstack/react-query"
import { type ReactNode, useRef } from "react"
import { Link } from "react-router"
import { adminHomeKeys } from "@/api/home"
import { type MyCallback, type TeamDay } from "@mito/contract/home"
import {
  answerRateText,
  appointmentRateText,
  callbacksParts,
  callsText,
} from "../_lib/today"
import { AdminPart } from "./AdminPart"

// A cell's data and its skeleton share one line height, so a cell doesn't
// change height when its data arrives (AC50)
const LINE = "text-lg leading-7"

/** A cell while it loads: «…», with `name` for the screen readers */
function CellSkeleton({ name }: { name: string }) {
  return (
    <span role="status" className={`${LINE} text-muted-foreground`}>
      <span className="sr-only">{name}</span>
      <span aria-hidden>…</span>
    </span>
  )
}

/** A cell on a part of its own: the label takes the focus after «Riprova» (AC49) */
function Cell<A>({
  label,
  query,
  retryKey,
  what,
  loadingName,
  children,
}: {
  label: string
  query: UseQueryResult<A>
  retryKey: readonly unknown[]
  what: string
  loadingName: string
  children: (data: A) => ReactNode
}) {
  const title = useRef<HTMLSpanElement>(null)
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span
        ref={title}
        tabIndex={-1}
        className="text-xs text-muted-foreground outline-none"
      >
        {label}
      </span>
      {/* Where a text wraps the skeleton keeps its two lines too (AC50) */}
      <div className="@[62rem]:min-h-7 min-h-14">
        <AdminPart
          query={query}
          retryKey={retryKey}
          what={what}
          focus={title}
          loading={<CellSkeleton name={loadingName} />}
        >
          {children}
        </AdminPart>
      </div>
    </div>
  )
}

const TEAM_CELLS: ReadonlyArray<{
  label: string
  text: (day: TeamDay) => string
}> = [
  { label: "Chiamate oggi", text: callsText },
  { label: "Tasso di risposta", text: answerRateText },
  { label: "Tasso di appuntamento", text: appointmentRateText },
]

/**
 * The four numbers of today. The three of the team are one read, each cell with
 * its own error and skeleton (AC30). The queries come from `AdminHome`
 */
export function TodayStrip({
  day,
  callbacks,
}: {
  day: UseQueryResult<TeamDay>
  callbacks: UseQueryResult<{ overdue: MyCallback[]; today: MyCallback[] }>
}) {
  return (
    <div className="rounded-card @container grid grid-cols-4 divide-x divide-border border border-border bg-card shadow-card">
      {TEAM_CELLS.map(({ label, text }) => (
        <Cell
          key={label}
          label={label}
          query={day}
          retryKey={adminHomeKeys.day()}
          what="i numeri di oggi"
          loadingName="Caricamento dei numeri di oggi"
        >
          {(data) => <span className={LINE}>{text(data)}</span>}
        </Cell>
      ))}
      <Cell
        label="I tuoi richiami"
        query={callbacks}
        retryKey={adminHomeKeys.callbacks()}
        what="i tuoi richiami"
        loadingName="Caricamento dei tuoi richiami"
      >
        {({ overdue, today }) => {
          const parts = callbacksParts(overdue.length, today.length)
          if (!parts.overdue && !parts.today)
            return <span className={LINE}>Nessuno per oggi</span>
          return (
            <span className={`${LINE} flex flex-wrap items-baseline gap-x-2`}>
              <span>
                {parts.overdue ? (
                  <span className="text-destructive-text">{parts.overdue}</span>
                ) : null}
                {parts.overdue && parts.today ? " · " : null}
                {parts.today}
              </span>
              <Link
                to="/dashboard/lavoro"
                className="text-link underline-offset-3 text-sm font-medium hover:underline"
              >
                Lavorali
              </Link>
            </span>
          )
        }}
      </Cell>
    </div>
  )
}
