// The pieces of "Lavora da qui": labels and tones of the six states (D6), the
// Oggi/Scaduto markers of the Contatti list, the outcome buttons of
// "Registra chiamata", the diary table, the per-section loading and error, and
// the fake navigation. Prototype only: nothing imports it outside
// src/prototypes.

import * as React from "react"
import { addDays, format, isSameDay, startOfDay, subDays } from "date-fns"
import { it } from "date-fns/locale"
import { AlertTriangle, CalendarClock, Clock, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { type Tone } from "@/lib/tones"
import { cn } from "@/lib/utils"
import {
  type Callback,
  type Entry,
  type Outcome,
  type SectionId,
  type State,
} from "./fixtures"

export const stateLabels: Record<State, string> = {
  chiamare: "Da chiamare",
  "non risponde": "Non risponde",
  richiamare: "Richiamo",
  "app.to": "Appuntamento",
  caricato: "Pratica caricata",
  "non interessato": "Non interessato",
}

const stateTones: Record<State, Tone> = {
  chiamare: "blue",
  "non risponde": "orange",
  richiamare: "amber",
  "app.to": "teal",
  caricato: "indigo",
  "non interessato": "red",
}

export function StateBadge({
  state,
  callbackOn,
}: {
  state: State
  callbackOn?: Date | undefined
}) {
  return (
    <Badge tone={stateTones[state]}>
      {state === "richiamare" && callbackOn
        ? `Richiamo · ${format(callbackOn, "dd/MM")}`
        : stateLabels[state]}
    </Badge>
  )
}

/** The marker of the Prossimo alert column: "Scaduto" in red, "Oggi" in amber */
export function DueMarker({
  callback,
  long = false,
}: {
  callback: Callback
  /** "da 3 giorni" instead of "Scaduto" */
  long?: boolean
}) {
  const overdue = callback.daysLate > 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-medium",
        overdue ? "text-destructive-text" : "text-tag-amber-text"
      )}
    >
      {overdue ? (
        <AlertTriangle className="h-4 w-4" aria-hidden />
      ) : (
        <Clock className="h-4 w-4" aria-hidden />
      )}
      <span>
        {overdue ? (long ? lateText(callback.daysLate) : "Scaduto") : "Oggi"}
      </span>
    </span>
  )
}

export const lateText = (days: number) =>
  days === 1 ? "da ieri" : `da ${days} giorni`

export const number = (value: number) =>
  // Italian groups only from 5 digits; the dot also in 2.854
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

export function whenText(at: Date, now: Date) {
  if (isSameDay(at, now)) return `alle ${format(at, "HH:mm")}`
  if (isSameDay(at, subDays(now, 1))) return `ieri alle ${format(at, "HH:mm")}`
  return format(at, "dd/MM")
}

/** The line of the operator's day; no rates before the first call */
export function myDayText(day: {
  calls: number
  answered: number
  appointments: number
}) {
  if (day.calls === 0) return "Nessuna chiamata ancora"
  return `${day.answered} risposte · ${day.appointments} ${
    day.appointments === 1 ? "appuntamento" : "appuntamenti"
  }`
}

// The pages the home links to don't exist for fake contacts: say where the
// link goes instead of navigating
export function fakeNavigate(where: string) {
  toast(`Prototipo: qui si apre ${where}`)
}

export function ContactLink({
  callback,
  className,
  children,
}: {
  callback: Pick<Callback, "taskId" | "customer">
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={`/dashboard/contatti/${callback.taskId}`}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        fakeNavigate(`il contatto di ${callback.customer}`)
      }}
    >
      {children}
    </a>
  )
}

export function ListLink({
  where,
  className,
  children,
}: {
  where: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href="/dashboard/contatti"
      className={cn(
        "text-link underline-offset-3 font-medium hover:underline",
        className
      )}
      onClick={(event) => {
        event.preventDefault()
        fakeNavigate(`Contatti filtrata: ${where}`)
      }}
    >
      {children}
    </a>
  )
}

// ---- Registra chiamata (§5) ----

type OnRegister = (
  row: Callback,
  outcome: Outcome,
  callbackOn?: Date,
  message?: string
) => void

/**
 * The four outcomes: in a row when the nearest `@container` (the section of
 * the callbacks) is at least 63rem wide, 2×2 below
 */
export function OutcomeButtons({
  row,
  now,
  onRegister,
}: {
  row: Callback
  now: Date
  onRegister: OnRegister
}) {
  return (
    <div
      className="@min-[63rem]:flex @min-[63rem]:items-center grid grid-cols-2 gap-1.5"
      role="group"
      aria-label={`Esito della chiamata a ${row.customer}`}
    >
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onRegister(row, "non risponde")}
      >
        Non risponde
      </Button>
      <CallbackButton
        row={row}
        now={now}
        onSave={(day, msg) => onRegister(row, "richiamare", day, msg)}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onRegister(row, "app.to")}
      >
        Appuntamento
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onRegister(row, "non interessato")}
      >
        Non interessato
      </Button>
    </div>
  )
}

function CallbackButton({
  row,
  now,
  onSave,
}: {
  row: Callback
  now: Date
  onSave: (day: Date, message: string | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  // The draft outlives a close (a click outside, Esc): it is lost only when
  // the home unmounts, or saved, which closes the row and its buttons
  const [day, setDay] = React.useState<Date | undefined>()
  const [message, setMessage] = React.useState("")
  // After a save the row closes: the variant moves the focus, not the popover
  const saved = React.useRef(false)
  const tomorrow = addDays(startOfDay(now), 1)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary">
          <CalendarClock aria-hidden />
          Richiamare
        </Button>
      </PopoverTrigger>
      {/* To the left of the button: Radix then slides it up or down to stay
          in the window, so "Salva" is never below the bottom edge */}
      <PopoverContent
        side="left"
        align="center"
        collisionPadding={8}
        className="w-auto p-3"
        onCloseAutoFocus={(event) => {
          if (saved.current) event.preventDefault()
          saved.current = false
        }}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!day) return
            saved.current = true
            setOpen(false)
            onSave(day, message.trim() === "" ? undefined : message.trim())
          }}
        >
          <p className="font-label text-sm">Richiamare {row.customer}</p>
          <Calendar
            mode="single"
            locale={it}
            weekStartsOn={1}
            fixedWeeks
            defaultMonth={tomorrow}
            selected={day}
            onSelect={setDay}
            disabled={{ before: tomorrow }}
            className="p-0"
          />
          <Input
            placeholder="Messaggio (facoltativo)"
            aria-label="Messaggio"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Button type="submit" disabled={!day}>
            {day
              ? `Salva richiamo del ${format(day, "dd/MM")}`
              : "Scegli il giorno"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

// ---- The diary of today's calls (D2) ----

export const timeText = (at: Date) => format(at, "HH:mm")

export function EntryBadge({ entry }: { entry: Entry }) {
  return <StateBadge state={entry.outcome} callbackOn={entry.callbackOn} />
}

/** Where the call came from; not "Richiamo", which is also an outcome */
export const fromText = (entry: Entry) =>
  entry.from === "richiamo" ? "Da un alert" : "Dalla lista"

export function DiaryEmpty() {
  return (
    <p className="text-sm text-muted-foreground">
      Nessuna chiamata registrata oggi. Le chiamate che registri compaiono qui,
      con l&apos;esito e l&apos;ora.
    </p>
  )
}

/** Today's calls, newest first: time, client, outcome, message, source */
export function DiaryTable({ entries }: { entries: readonly Entry[] }) {
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
        {entries.map((e) => (
          <tr
            key={e.id}
            className="border-b border-border align-middle last:border-b-0"
          >
            <td className="px-5 py-2 tabular-nums text-muted-foreground">
              {timeText(e.at)}
            </td>
            <td className="px-2 py-2">
              <ContactLink
                callback={e}
                className="font-label block truncate text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {e.customer}
              </ContactLink>
              <span className="block tabular-nums text-muted-foreground">
                {e.phone}
              </span>
            </td>
            <td className="px-2 py-2">
              <EntryBadge entry={e} />
            </td>
            <td
              className="truncate px-2 py-2 text-muted-foreground"
              title={e.message}
            >
              {e.message ?? ""}
            </td>
            <td className="px-5 py-2 text-muted-foreground">{fromText(e)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Each section loads and fails on its own (§7) ----

type Status = "loading" | "error" | "ready"
type SectionsValue = {
  status: (id: SectionId) => Status
  retry: (id: SectionId) => void
}

const SectionsContext = React.createContext<SectionsValue>({
  status: () => "ready",
  retry: () => undefined,
})

export function SectionsProvider({
  loading = [],
  failing = [],
  children,
}: {
  loading?: readonly SectionId[] | undefined
  failing?: readonly SectionId[] | undefined
  children: React.ReactNode
}) {
  const [retrying, setRetrying] = React.useState<ReadonlySet<SectionId>>(
    new Set()
  )
  const [recovered, setRecovered] = React.useState<ReadonlySet<SectionId>>(
    new Set()
  )
  const value = React.useMemo<SectionsValue>(
    () => ({
      status: (id) =>
        loading.includes(id) || retrying.has(id)
          ? "loading"
          : failing.includes(id) && !recovered.has(id)
            ? "error"
            : "ready",
      retry: (id) => {
        setRetrying((s) => new Set(s).add(id))
        window.setTimeout(() => {
          setRetrying((s) => {
            const next = new Set(s)
            next.delete(id)
            return next
          })
          setRecovered((s) => new Set(s).add(id))
        }, 700)
      },
    }),
    [loading, failing, retrying, recovered]
  )
  return (
    <SectionsContext.Provider value={value}>
      {children}
    </SectionsContext.Provider>
  )
}

/** Whether every one of the sections has its data */
export function useReady(ids: readonly SectionId[]) {
  const { status } = React.useContext(SectionsContext)
  return ids.every((id) => status(id) === "ready")
}

/** The body of a section: a skeleton while it loads, the error with Riprova */
export function SectionBody({
  ids,
  skeleton,
  what,
  children,
}: {
  ids: readonly SectionId[]
  skeleton: React.ReactNode
  /** "i richiami": the error says what didn't load */
  what: string
  children: React.ReactNode
}) {
  const { status, retry } = React.useContext(SectionsContext)
  const statuses = ids.map(status)
  if (statuses.includes("loading")) {
    return (
      <div aria-busy="true" aria-label={`Caricamento di ${what}`}>
        {skeleton}
      </div>
    )
  }
  if (statuses.includes("error")) {
    return (
      <div
        role="alert"
        className="rounded-control border-destructive-soft-border bg-destructive-soft text-destructive-soft-foreground flex flex-col items-start gap-2 border px-3 py-3 text-sm"
      >
        <span>Non è stato possibile caricare {what}.</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => ids.forEach((id) => retry(id))}
        >
          <RotateCw aria-hidden />
          Riprova
        </Button>
      </div>
    )
  }
  return <>{children}</>
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** The greeting at the top of every variant */
export function PageTitle({ now }: { now: Date }) {
  const day = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now)
  return (
    <div>
      <h1 className="font-heading text-title">Buongiorno, Giulia</h1>
      <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
        {day}
      </p>
    </div>
  )
}
