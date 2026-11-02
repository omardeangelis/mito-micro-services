// "Lavora da qui": the callbacks in one table with the four
// outcomes of "Registra chiamata" (§5) on each row, so the call is logged
// without leaving the home; below it, "Fatti oggi", the diary of today's calls,
// where a call just registered shows up at the top. Non risponde keeps an
// overdue alert open (D1): the row stays, marked as tried. The other outcomes
// close the alert: the row stays where it is, closed, with what was
// registered in place of the buttons, and the focus goes to the next open
// row. The four outcomes go 2×2 when the table is narrow, so the client's
// name always has room.

import * as React from "react"
import { format } from "date-fns"
import { Check } from "lucide-react"
import { CallOutcomes } from "@/components/custom/contact/call/CallOutcomes"
import { StateBadge } from "@/components/custom/contact/call/StateBadge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Callback, type Scenario } from "./fixtures"
import { type Register, useDay, useRowFocus } from "./day"
import {
  ContactLink,
  DiaryEmpty,
  DiaryTable,
  DueMarker,
  ListLink,
  PageTitle,
  RowsSkeleton,
  SectionBody,
  myDayText,
  stateLabels,
  number,
  useReady,
  whenText,
} from "./shared"

const DIARY_FIRST = 8

export function VariantLavora({
  scenario,
  now,
}: {
  scenario: Scenario
  now: Date
}) {
  const day = useDay(scenario)
  const focusRow = useRowFocus()
  const tableRef = React.useRef<HTMLTableSectionElement>(null)
  const ready = useReady(["overdue", "today"])
  const diaryReady = useReady(["diary"])
  const [allDiary, setAllDiary] = React.useState(false)

  const rows = day.queue
  const register: Register = (row, outcome, callbackOn, message) => {
    const index = rows.findIndex((r) => r.taskId === row.taskId)
    day.register(row, outcome, callbackOn, message)
    if (outcome === "non risponde") return
    // The next open row, else the last open one above, else the row itself
    const open = (r: Callback, i: number) => !r.done && i !== index
    const after = rows.findIndex((r, i) => i > index && open(r, i))
    const before = rows
      .map((r, i) => (i < index && open(r, i) ? i : -1))
      .reduce((last, i) => Math.max(last, i), -1)
    focusRow(tableRef, after >= 0 ? after : before >= 0 ? before : index)
  }

  const overdue = rows.filter((r) => !r.done && r.daysLate > 0)
  const today = rows.filter((r) => !r.done && r.daysLate === 0)
  const diary = allDiary ? day.diary : day.diary.slice(0, DIARY_FIRST)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle now={now} />
        <dl className="rounded-card flex items-stretch divide-x divide-border border border-border bg-card text-sm shadow-card">
          <Stat label="Il mio oggi" ids={["myDay"]}>
            {day.myDay.calls === 0 ? (
              <span className="text-muted-foreground">
                {myDayText(day.myDay)}
              </span>
            ) : (
              <>
                <span className="font-label tabular-nums">
                  {day.myDay.calls}{" "}
                  {day.myDay.calls === 1 ? "chiamata" : "chiamate"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {myDayText(day.myDay)}
                </span>{" "}
                <a
                  href="#fatti-title"
                  className="text-link underline-offset-3 font-medium hover:underline"
                  onClick={(event) => {
                    event.preventDefault()
                    const title = document.getElementById("fatti-title")
                    title?.scrollIntoView({ block: "start" })
                    title?.focus({ preventScroll: true })
                  }}
                >
                  Vedi le chiamate
                </a>
              </>
            )}
          </Stat>
          <Stat label="Da chiamare" ids={["toCall"]}>
            <span className="font-label tabular-nums">
              {number(scenario.toCall)}
            </span>{" "}
            {scenario.toCall > 0 ? (
              <ListLink where="Solo i miei, Da chiamare e Non risponde">
                Apri la lista
              </ListLink>
            ) : null}
          </Stat>
        </dl>
      </div>

      <section
        aria-labelledby="lavora-title"
        className="rounded-card @container border border-border bg-card shadow-card"
      >
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3">
          <h2 id="lavora-title" className="font-heading text-lg">
            Richiami da fare
          </h2>
          {ready && rows.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {overdue.length > 0 ? `${number(overdue.length)} scaduti · ` : ""}
              {number(today.length)} di oggi
            </span>
          ) : null}
        </header>
        <SectionBody
          ids={["overdue", "today"]}
          what="i richiami"
          skeleton={
            <div className="px-5 py-3">
              <RowsSkeleton rows={8} />
            </div>
          }
        >
          {rows.length === 0 ? (
            <div className="px-5 py-6">
              <p className="font-label">Nessun richiamo da fare.</p>
              <p className="text-sm text-muted-foreground">
                {scenario.toCall > 0 ? (
                  <>
                    Puoi partire dai {number(scenario.toCall)} contatti da
                    chiamare.{" "}
                    <ListLink where="Solo i miei, Da chiamare e Non risponde">
                      Apri la lista
                    </ListLink>
                  </>
                ) : (
                  "Non hai ancora contatti assegnati: li assegna un amministratore."
                )}
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              {/* From 63rem the outcomes fit in a row (31.5rem) and Cliente
                  keeps 13rem; below, they go 2×2 in 18rem */}
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
              <tbody ref={tableRef}>
                {rows.map((row, i) => (
                  <Row
                    key={row.taskId}
                    row={row}
                    index={i}
                    now={now}
                    groupStart={
                      i === 0 || rows[i - 1]!.daysLate > 0 !== row.daysLate > 0
                        ? row.daysLate > 0
                          ? `Scaduti · ${number(overdue.length)}`
                          : `Di oggi · ${number(today.length)}`
                        : null
                    }
                    onRegister={register}
                  />
                ))}
              </tbody>
            </table>
          )}
        </SectionBody>
      </section>

      <section
        aria-labelledby="fatti-title"
        className="rounded-card border border-border bg-card shadow-card"
      >
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3">
          <h2
            id="fatti-title"
            tabIndex={-1}
            className="font-heading scroll-mt-4 text-lg outline-none"
          >
            Fatti oggi
          </h2>
          {diaryReady && day.diary.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {number(day.diary.length)}{" "}
              {day.diary.length === 1 ? "chiamata" : "chiamate"}, dalla più
              recente
            </span>
          ) : null}
        </header>
        <SectionBody
          ids={["diary"]}
          what="le chiamate di oggi"
          skeleton={
            <div className="px-5 py-3">
              <RowsSkeleton rows={4} />
            </div>
          }
        >
          {day.diary.length === 0 ? (
            <div className="px-5 py-4">
              <DiaryEmpty />
            </div>
          ) : (
            <>
              <DiaryTable entries={diary} />
              {day.diary.length > DIARY_FIRST ? (
                <div className="border-t border-border px-5 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllDiary((v) => !v)}
                  >
                    {allDiary
                      ? "Mostra solo le ultime"
                      : `Mostra tutte le ${number(day.diary.length)}`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </SectionBody>
      </section>
    </div>
  )
}

function Stat({
  label,
  ids,
  children,
}: {
  label: string
  ids: Parameters<typeof useReady>[0]
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col justify-center px-4 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <SectionBody
          ids={ids}
          what={label.toLowerCase()}
          skeleton={<span className="text-muted-foreground">…</span>}
        >
          {children}
        </SectionBody>
      </dd>
    </div>
  )
}

function Row({
  row,
  index,
  now,
  groupStart,
  onRegister,
}: {
  row: Callback
  index: number
  now: Date
  groupStart: string | null
  onRegister: Register
}) {
  return (
    <>
      {groupStart ? (
        <tr>
          <th
            colSpan={4}
            scope="colgroup"
            className="font-label bg-muted px-5 py-1.5 text-left text-xs uppercase tracking-wide text-muted-foreground"
          >
            {groupStart}
          </th>
        </tr>
      ) : null}
      <tr
        data-row={index}
        className="border-b border-border align-middle last:border-b-0"
      >
        <td className="px-5 py-2.5">
          <ContactLink
            callback={row}
            className="font-label block truncate text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {row.customer}
          </ContactLink>
          <span
            className="block truncate text-muted-foreground"
            title={row.message ?? undefined}
          >
            <span className="tabular-nums">{row.phone}</span> ·{" "}
            {row.message ?? "Nessun messaggio"}
          </span>
        </td>
        <td className="px-2 py-2.5">
          <DueMarker callback={row} long />
        </td>
        <td className="px-2 py-2.5">
          <div className="flex flex-col items-start gap-0.5">
            <StateBadge state={row.state} />
            {row.triedAt ? (
              <span className="text-xs text-muted-foreground">
                tentato {whenText(row.triedAt, now)}
              </span>
            ) : null}
          </div>
        </td>
        <td className="@min-[63rem]:px-5 px-3 py-2.5">
          {/* The buttons keep their place under the closed line, hidden, so
              the row keeps its height and nothing moves under the pointer */}
          <div className="grid">
            <div className={cn("[grid-area:1/1]", row.done && "invisible")}>
              <CallOutcomes
                customer={row.customer}
                now={now}
                onOutcome={(outcome, day, message) =>
                  onRegister(row, outcome, day, message)
                }
              />
            </div>
            {row.done ? (
              <p className="flex items-center gap-1.5 self-center text-muted-foreground [grid-area:1/1]">
                <Check className="h-4 w-4 shrink-0" aria-hidden />
                {doneText(row.done)}
              </p>
            ) : null}
          </div>
        </td>
      </tr>
    </>
  )
}

function doneText(done: NonNullable<Callback["done"]>) {
  const at = format(done.at, "HH:mm")
  if (done.outcome === "richiamare" && done.callbackOn) {
    return `Richiamo il ${format(done.callbackOn, "dd/MM")} registrato alle ${at}`
  }
  return `${stateLabels[done.outcome]} registrato alle ${at}`
}
