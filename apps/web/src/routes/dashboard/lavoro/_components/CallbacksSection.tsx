import { useRef, useState } from "react"
import { type CallOutcome } from "@mito/domain/contact/outcome"
import { useMyToCall } from "@/api/home"
import { thousands } from "../_lib/format"
import { type Register, useCallbackQueue } from "../_hooks/useCallbackQueue"
import {
  countsOf,
  type Queue,
  type QueueCounts,
  type QueueGroup,
} from "../_lib/queue"
import { CallbackRow } from "./CallbackRow"
import { Part } from "./PartError"
import { PartSkeleton } from "./PartSkeleton"
import { ToCallLink } from "./ToCallBox"

const GROUPS: ReadonlyArray<{ group: QueueGroup; title: string }> = [
  { group: "overdue", title: "Scaduti" },
  { group: "today", title: "Di oggi" },
]

/** «1 scaduto · 2 di oggi», only the open rows; no «scaduti» without any (AC13) */
const countText = ({ overdue, today }: QueueCounts) => {
  const todayText = `${thousands(today.open)} di oggi`
  if (overdue.open === 0) return todayText
  const noun = overdue.open === 1 ? "scaduto" : "scaduti"
  return `${thousands(overdue.open)} ${noun} · ${todayText}`
}

/** No rows: where to start from, if the number of «Da chiamare» is known (AC24) */
function CallbacksEmpty({ total }: { total: number | undefined }) {
  return (
    <div className="px-5 py-6">
      <p className="font-label">Nessun richiamo da fare.</p>
      {total === undefined ? null : (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? (
            "Non hai contatti da chiamare: li assegna un amministratore."
          ) : (
            <>
              {total === 1
                ? "Puoi partire dal contatto da chiamare."
                : `Puoi partire dai ${thousands(total)} contatti da chiamare.`}{" "}
              <ToCallLink />
            </>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * The rows, all of them, in their two groups. A group with no rows at the load
 * has no header; one whose rows closed keeps it, with «· 0» (AC12, AC14)
 */
function CallbacksTable({
  queue,
  now,
  sending,
  failures,
  register,
}: {
  queue: Queue
  now: Date
  sending: ReadonlyMap<number, CallOutcome>
  failures: ReadonlyMap<number, string | true>
  register: Register
}) {
  const counts = countsOf(queue)
  return (
    <table className="w-full table-fixed text-sm">
      {/* From 63rem the outcomes fit in a row (31.5rem) and Cliente keeps
          13rem; below, they go 2×2 in 18rem */}
      <colgroup>
        <col />
        <col className="w-28" />
        <col className="w-36" />
        <col className="@min-[63rem]:w-[31.5rem] w-72" />
      </colgroup>
      <thead className="text-left text-xs text-muted-foreground">
        <tr className="border-b border-border">
          <th className="font-label px-5 py-2">Cliente</th>
          <th className="font-label px-2 py-2">Richiamo</th>
          <th className="font-label px-2 py-2">Stato</th>
          <th className="font-label @min-[63rem]:px-5 px-3 py-2">
            Registra chiamata
          </th>
        </tr>
      </thead>
      {GROUPS.filter(({ group }) => counts[group].loaded).map(
        ({ group, title }) => (
          <tbody key={group}>
            <tr>
              <th
                colSpan={4}
                scope="colgroup"
                className="font-label bg-muted px-5 py-1.5 text-left text-xs uppercase tracking-wide text-muted-foreground"
              >
                {`${title} · ${thousands(counts[group].open)}`}
              </th>
            </tr>
            {queue
              .filter((row) => row.group === group)
              .map((row) => (
                <CallbackRow
                  key={row.alertId}
                  row={row}
                  now={now}
                  pending={sending.get(row.alertId) ?? null}
                  failure={failures.get(row.alertId) ?? null}
                  register={register}
                />
              ))}
          </tbody>
        )
      )}
    </table>
  )
}

/** «Richiami da fare»: the rows of the queue, never those of the last read */
export function CallbacksSection() {
  const { queue, callbacks, sending, failures, register } = useCallbackQueue()
  // Here and not in the empty state: an observer mounted later, on a read that
  // is already stale, would read «Da chiamare» a second time
  const toCall = useMyToCall()
  // Stable, or a new date would draw every row
  const [now] = useState(() => new Date())
  const title = useRef<HTMLHeadingElement>(null)
  const rows = queue ?? undefined
  return (
    <section
      aria-labelledby="lavora-title"
      className="rounded-card @container border border-border bg-card shadow-card"
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3">
        <h2
          id="lavora-title"
          ref={title}
          tabIndex={-1}
          className="font-heading text-lg outline-none"
        >
          Richiami da fare
        </h2>
        {queue !== null && queue.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {countText(countsOf(queue))}
          </span>
        ) : null}
      </header>
      <Part
        query={callbacks}
        data={rows}
        what="i richiami"
        announced="Richiami caricati"
        focus={title}
        loading={<PartSkeleton rows={8} label="Caricamento dei richiami" />}
        inset
      >
        {(loaded) =>
          loaded.length > 0 ? (
            <CallbacksTable
              queue={loaded}
              now={now}
              sending={sending}
              failures={failures}
              register={register}
            />
          ) : (
            <CallbacksEmpty total={toCall.data?.total} />
          )
        }
      </Part>
    </section>
  )
}
