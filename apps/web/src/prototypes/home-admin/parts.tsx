// The pieces every variant of the admin's home shares: the top (title, quick
// actions, the numbers of today), "Il team oggi" (one operator per row, which
// opens on that operator's calls and overdue alerts) and the bar of a Wave's
// progress. The variants differ in where the Wave sit and how one assigns.

import * as React from "react"
import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns"
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Upload,
  UserPlus,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  ContactLink,
  DueMarker,
  EntryBadge,
  ListLink,
  RowsSkeleton,
  SectionBody,
  fakeNavigate,
  number,
  timeText,
  useReady,
} from "../home-operatore/shared"
import {
  type AdminScenario,
  type Operator,
  type Role,
  type Wave,
  isActive,
} from "./fixtures"
import { AssignPopover } from "./assign"
import { type Plan, bestWave } from "./team"

const percent = new Intl.NumberFormat("it-IT", {
  style: "percent",
  maximumFractionDigits: 1,
})

/** Few enough contacts left that the operator needs more */
const LOW = 300
/** Minutes without a call, in a day already started, worth a look */
const IDLE = 60
const CALLS_FIRST = 8
const OVERDUE_FIRST = 6

type Sort = "overdue" | "calls" | "name"

/** The title with the quick actions, and the numbers of today */
export function Top({
  scenario,
  operators,
  now,
}: {
  scenario: AdminScenario
  operators: readonly Operator[]
  now: Date
}) {
  const calls = operators.reduce((s, o) => s + o.day.calls, 0)
  const answered = operators.reduce((s, o) => s + o.day.answered, 0)
  const appointments = operators.reduce((s, o) => s + o.day.appointments, 0)
  const calling = operators.filter((o) => o.day.calls > 0).length

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Title now={now} />
        <nav aria-label="Azioni rapide" className="flex flex-wrap gap-2">
          <QuickAction
            icon={<UserPlus aria-hidden />}
            where="Clienti, per l'assegnazione massiva"
          >
            Assegna da Clienti
          </QuickAction>
          <QuickAction icon={<Upload aria-hidden />} where="Import">
            Importa
          </QuickAction>
          <QuickAction icon={<BarChart3 aria-hidden />} where="Analisi">
            Analisi
          </QuickAction>
          <QuickAction icon={<Users aria-hidden />} where="Team">
            Team
          </QuickAction>
        </nav>
      </div>

      <dl className="rounded-card grid grid-cols-2 divide-border border border-border bg-card text-sm shadow-card lg:grid-cols-4 lg:divide-x">
        <Stat label="Chiamate oggi" ids={["teamDay"]}>
          {calls === 0 ? (
            <span className="text-muted-foreground">
              Nessuna chiamata ancora
            </span>
          ) : (
            <>
              <span className="font-label text-lg tabular-nums">
                {number(calls)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {calling} su {operators.length} operatori
              </span>
            </>
          )}
        </Stat>
        <Stat label="Tasso di risposta" ids={["teamDay"]}>
          <Rate
            part={answered}
            of={calls}
            what={answered === 1 ? "risposta" : "risposte"}
            empty="Dopo le prime chiamate"
          />
        </Stat>
        <Stat label="Tasso di appuntamento" ids={["teamDay"]}>
          {/* On the answers, like Analisi and the export (spec OQ7) */}
          <Rate
            part={appointments}
            of={answered}
            what={appointments === 1 ? "appuntamento" : "appuntamenti"}
            empty={
              calls === 0 ? "Dopo le prime chiamate" : "Dopo le prime risposte"
            }
          />
        </Stat>
        <Stat label="I tuoi richiami" ids={["mine"]}>
          {scenario.mine.overdue + scenario.mine.today === 0 ? (
            <span className="text-muted-foreground">Nessuno per oggi</span>
          ) : (
            <>
              <span className="tabular-nums">
                {scenario.mine.overdue > 0 ? (
                  <span className="text-destructive-text font-medium">
                    {scenario.mine.overdue}{" "}
                    {scenario.mine.overdue === 1 ? "scaduto" : "scaduti"}
                  </span>
                ) : null}
                {scenario.mine.overdue > 0 && scenario.mine.today > 0
                  ? " · "
                  : ""}
                {scenario.mine.today > 0
                  ? `${scenario.mine.today} di oggi`
                  : ""}
              </span>{" "}
              <a
                href="/dashboard"
                className="text-link underline-offset-3 font-medium hover:underline"
                onClick={(event) => {
                  event.preventDefault()
                  fakeNavigate(
                    "i tuoi richiami, come in Lavora da qui dell'operatore"
                  )
                }}
              >
                Lavorali
              </a>
            </>
          )}
        </Stat>
      </dl>
    </>
  )
}

function Title({ now }: { now: Date }) {
  const day = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now)
  return (
    <div>
      <h1 className="font-heading text-title">Buongiorno, Paola</h1>
      <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
        {day}
      </p>
    </div>
  )
}

function QuickAction({
  icon,
  where,
  children,
}: {
  icon: React.ReactNode
  where: string
  children: React.ReactNode
}) {
  return (
    <Button variant="secondary" onClick={() => fakeNavigate(where)}>
      {icon}
      {children}
    </Button>
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
    <div className="flex flex-col justify-center px-4 py-2.5">
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

/** A rate has no value before its first call or answer: no "0%" (§7) */
function Rate({
  part,
  of,
  what,
  empty,
}: {
  part: number
  of: number
  what: string
  empty: string
}) {
  if (of === 0) {
    return <span className="text-muted-foreground">{empty}</span>
  }
  return (
    <>
      <span className="font-label text-lg tabular-nums">
        {percent.format(part / of)}
      </span>
      <span className="text-muted-foreground">
        {" "}
        · {number(part)} {what}
      </span>
    </>
  )
}

// ---- Dettaglio giornaliero ----

const sorters: Record<Sort, (a: Operator, b: Operator) => number> = {
  // Who is most behind first (§4.3)
  overdue: (a, b) =>
    b.overdue.length - a.overdue.length ||
    (b.overdue[0]?.daysLate ?? 0) - (a.overdue[0]?.daysLate ?? 0),
  calls: (a, b) => b.day.calls - a.day.calls,
  name: (a, b) => a.name.localeCompare(b.name, "it"),
}

const calledText = (k: number, m: number) =>
  `${k} su ${m} ${k === 1 ? "ha" : "hanno"} chiamato`

/** "Dettaglio giornaliero": the operators, then the admins, each group foldable */
export function TeamSection({
  operators,
  waves,
  now,
  onAssign,
}: {
  operators: readonly Operator[]
  waves: readonly Wave[]
  now: Date
  onAssign: (plan: Plan) => void
}) {
  const calling = operators.filter((o) => o.day.calls > 0).length
  const [sort, setSort] = React.useState<Sort>("overdue")
  const [open, setOpen] = React.useState<ReadonlySet<number>>(new Set())
  // The operators open, the admins closed (spec AC27)
  const [shut, setShut] = React.useState<ReadonlySet<Role>>(new Set(["ADMIN"]))
  const ready = useReady(["team"])
  const behind = operators.filter((o) => o.overdue.length > 0).length

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const fold = (role: Role) =>
    setShut((s) => {
      const next = new Set(s)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })

  const groups = (
    [
      ["OPERATORE", "Operatori", "Operatore"],
      ["ADMIN", "Admin", "Admin"],
    ] as const
  )
    .map(([role, title, column]) => ({
      role,
      title,
      column,
      rows: operators.filter((o) => o.role === role).sort(sorters[sort]),
    }))
    .filter((g) => g.rows.length > 0)

  return (
    <section
      aria-labelledby="team-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-4">
          <h2 id="team-title" className="font-heading text-lg">
            Dettaglio giornaliero
          </h2>
          {ready ? (
            <span className="text-sm text-muted-foreground">
              {calledText(calling, operators.length)}
              {behind > 0 ? ` · ${behind} con arretrati` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span id="team-sort">Ordina per</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={sort}
            onValueChange={(v) => v && setSort(v as Sort)}
            aria-labelledby="team-sort"
          >
            <ToggleGroupItem value="overdue">Arretrati</ToggleGroupItem>
            <ToggleGroupItem value="calls">Chiamate</ToggleGroupItem>
            <ToggleGroupItem value="name">Nome</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <SectionBody
        ids={["team"]}
        what="i numeri del team"
        skeleton={
          <div className="px-5 py-3">
            <RowsSkeleton rows={10} />
          </div>
        }
      >
        {groups.map((g) => {
          const isOpen = !shut.has(g.role)
          const groupId = `team-${g.role}`
          return (
            <div
              key={g.role}
              className="border-b border-border last:border-b-0"
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={groupId}
                  onClick={() => fold(g.role)}
                  className="flex w-full items-center gap-1.5 px-5 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      isOpen && "rotate-90"
                    )}
                  />
                  <span className="font-label">{g.title}</span>
                  <span className="text-muted-foreground">
                    ·{" "}
                    {calledText(
                      g.rows.filter((o) => o.day.calls > 0).length,
                      g.rows.length
                    )}
                  </span>
                </button>
              </h3>
              {isOpen ? (
                <div id={groupId} className="relative overflow-x-auto">
                  <table className="w-full min-w-[70rem] table-fixed text-sm">
                    <colgroup>
                      <col />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-28" />
                      <col className="w-36" />
                      <col className="w-44" />
                      <col className="w-44" />
                      <col className="w-28" />
                    </colgroup>
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-y border-border">
                        <th className="font-label px-5 py-2">{g.column}</th>
                        <th className="font-label px-2 py-2 text-right">
                          Chiamate
                        </th>
                        <th className="font-label px-2 py-2 text-right">
                          Risposta
                        </th>
                        <th className="font-label px-2 py-2 text-right">
                          Appuntamenti
                        </th>
                        <th className="font-label py-2 pl-6 pr-2">
                          Ultima chiamata
                        </th>
                        <th className="font-label px-2 py-2">Arretrati</th>
                        <th className="font-label px-2 py-2">Da chiamare</th>
                        <th className="px-5 py-2">
                          <span className="sr-only">Assegna</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((o) => (
                        <OperatorRow
                          key={o.id}
                          operator={o}
                          operators={operators}
                          waves={waves}
                          now={now}
                          open={open.has(o.id)}
                          onToggle={() => toggle(o.id)}
                          onAssign={onAssign}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )
        })}
      </SectionBody>
    </section>
  )
}

function OperatorRow({
  operator: o,
  operators,
  waves,
  now,
  open,
  onToggle,
  onAssign,
}: {
  operator: Operator
  operators: readonly Operator[]
  waves: readonly Wave[]
  now: Date
  open: boolean
  onToggle: () => void
  onAssign: (plan: Plan) => void
}) {
  const detailId = `operator-${o.id}-detail`
  const last = o.diary[0]?.at
  const idle = last ? differenceInMinutes(now, last) : 0
  const oldest = o.overdue[0]
  return (
    <>
      <tr
        className={cn(
          "border-b border-border align-middle",
          open && "bg-accent/40"
        )}
      >
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={onToggle}
            className="font-label flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground",
                open && "rotate-90"
              )}
            />
            <span className="truncate">{o.name}</span>
          </button>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {o.day.calls === 0 ? (
            <span className="text-muted-foreground">0</span>
          ) : (
            <span className="font-label">{o.day.calls}</span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {o.day.calls === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            percent.format(o.day.answered / o.day.calls)
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {o.day.calls === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            o.day.appointments
          )}
        </td>
        <td className="py-2 pl-6 pr-2">
          {last ? (
            <div className="flex flex-col">
              <span className="tabular-nums">alle {timeText(last)}</span>
              {idle >= IDLE ? (
                <span className="text-tag-amber-text text-xs">
                  ferma da {durationText(idle)}
                </span>
              ) : null}
            </div>
          ) : o.away > 0 ? (
            <span
              className={cn(
                isActive(o) ? "text-muted-foreground" : "text-tag-amber-text"
              )}
            >
              {o.away === 1
                ? "Ieri"
                : isActive(o)
                  ? `${o.away} giorni fa`
                  : `Fermo da ${o.away} giorni`}
            </span>
          ) : (
            <span className="text-muted-foreground">Nessuna oggi</span>
          )}
        </td>
        <td className="px-2 py-2">
          {oldest ? (
            <div className="flex flex-col">
              <span className="text-destructive-text inline-flex items-center gap-1 font-medium tabular-nums">
                <AlertTriangle aria-hidden className="size-4" />
                {o.overdue.length}
              </span>
              <span className="text-xs text-muted-foreground">
                il più vecchio {daysText(oldest.daysLate)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Nessuno</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-col">
            <span className="tabular-nums">{number(o.toCall)}</span>
            {o.toCall < LOW ? (
              <span className="text-tag-amber-text text-xs">
                {o.toCall === 0 ? "Finiti" : "Quasi finiti"}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {number(o.neverCalled)} mai chiamati
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-2 text-right">
          <AssignPopover
            waves={waves}
            operators={operators}
            wave={bestWave(waves)}
            to={[o.id]}
            label={`Assegna contatti a ${o.name}`}
            onAssign={onAssign}
          />
        </td>
      </tr>
      {open ? (
        <tr id={detailId} className="border-b border-border bg-accent/40">
          <td colSpan={8} className="px-5 pb-4 pt-1">
            <OperatorDetail operator={o} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/** Today's calls and the overdue alerts of one operator */
function OperatorDetail({ operator: o }: { operator: Operator }) {
  const [allCalls, setAllCalls] = React.useState(false)
  const calls = allCalls ? o.diary : o.diary.slice(0, CALLS_FIRST)
  const first = o.name.split(" ")[0]
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="rounded-control border border-border bg-card">
        <h3 className="font-label border-b border-border px-3 py-2 text-sm">
          Chiamate di oggi
          <span className="font-sans font-normal text-muted-foreground">
            {" "}
            · {o.diary.length}
          </span>
        </h3>
        {o.diary.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {first} non ha ancora registrato chiamate oggi.
          </p>
        ) : (
          <>
            <ul>
              {calls.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-[3.5rem_minmax(0,14rem)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {timeText(e.at)}
                  </span>
                  <ContactLink
                    callback={e}
                    className="font-label truncate text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {e.customer}
                  </ContactLink>
                  <EntryBadge entry={e} />
                  <span
                    className="truncate text-muted-foreground"
                    title={e.message}
                  >
                    {e.message ?? ""}
                  </span>
                </li>
              ))}
            </ul>
            {o.diary.length > CALLS_FIRST ? (
              <div className="border-t border-border px-1.5 py-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAllCalls((v) => !v)}
                >
                  {allCalls
                    ? "Mostra solo le ultime"
                    : `Mostra tutte le ${o.diary.length}`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="rounded-control border border-border bg-card">
        <h3 className="font-label border-b border-border px-3 py-2 text-sm">
          Arretrati
          <span className="font-sans font-normal text-muted-foreground">
            {" "}
            · {o.overdue.length}, dal più vecchio
          </span>
        </h3>
        {o.overdue.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            Nessun richiamo scaduto.
          </p>
        ) : (
          <>
            <ul>
              {o.overdue.slice(0, OVERDUE_FIRST).map((c) => (
                <li
                  key={c.taskId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <ContactLink
                      callback={c}
                      className="font-label block truncate text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {c.customer}
                    </ContactLink>
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={c.message ?? undefined}
                    >
                      {c.triedAt
                        ? `Tentato alle ${format(c.triedAt, "HH:mm")}`
                        : (c.message ?? "Nessun messaggio")}
                    </span>
                  </div>
                  <DueMarker callback={c} long />
                </li>
              ))}
            </ul>
            {o.overdue.length > OVERDUE_FIRST ? (
              <div className="border-t border-border px-3 py-2 text-sm">
                <ListLink where={`Operatore ${o.name}, alert scaduti`}>
                  Vedi tutti i {o.overdue.length} in Contatti
                </ListLink>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

const daysText = (days: number) =>
  days === 1 ? "da ieri" : `da ${days} giorni`

function durationText(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

// ---- Le Wave ----

/** Days since the import, in words */
export function agoText(at: Date, now: Date) {
  const days = differenceInCalendarDays(now, at)
  return days === 0 ? "oggi" : days === 1 ? "ieri" : `${days} giorni fa`
}

/**
 * A Wave in four parts: worked, called without an outcome, never called,
 * without an operator
 */
export function WaveBar({
  wave: w,
  className,
}: {
  wave: Wave
  className?: string
}) {
  const parts = [
    { n: w.worked, className: "bg-primary" },
    { n: w.attempted, className: "bg-primary/45" },
    { n: w.neverCalled, className: "bg-muted-foreground/30" },
    { n: w.unassigned, className: "bg-tag-amber-dot" },
  ]
  return (
    <div
      role="meter"
      aria-label={`Avanzamento della ${w.name}`}
      aria-valuemin={0}
      aria-valuemax={w.customers}
      aria-valuenow={w.worked}
      aria-valuetext={`${number(w.worked)} su ${number(w.customers)} lavorati`}
      className={cn(
        "flex h-2 overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      {parts.map((p, i) =>
        p.n > 0 ? (
          <div
            key={i}
            className={cn("h-full", p.className)}
            style={{ width: `${(p.n / w.customers) * 100}%` }}
          />
        ) : null
      )}
    </div>
  )
}

export const doneText = (w: Wave) =>
  `${number(w.worked)} lavorati · ${percent.format(
    Math.floor((w.worked / w.customers) * 100) / 100
  )}`

/** The legend of WaveBar */
export function WaveLegend() {
  const items = [
    ["bg-primary", "Lavorati"],
    ["bg-primary/45", "Chiamati, senza esito"],
    ["bg-muted-foreground/30", "Mai chiamati"],
    ["bg-tag-amber-dot", "Senza operatore"],
  ] as const
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([color, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", color)} />
          {label}
        </li>
      ))}
    </ul>
  )
}
