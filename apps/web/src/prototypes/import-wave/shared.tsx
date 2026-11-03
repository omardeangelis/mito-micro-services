// The pieces every variant of the Wave's page shares: header, deadline,
// parts, the split's controls with the Attive / Assegnate / Totale preview, the
// expired Wave.

import * as React from "react"
import { addDays, endOfMonth, isSameDay, startOfDay } from "date-fns"
import { it } from "date-fns/locale"
import { AlertTriangle, CalendarDays, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { number } from "../home-operatore/shared"
import { type Operator, isActive } from "../home-admin/fixtures"
import { WaveBar, agoText } from "../home-admin/parts"
import { type WaveRun } from "./fixtures"
import {
  DEFAULT_DAYS,
  type HowMany,
  type Split,
  type Strategy,
  type WaveModel,
  type Which,
  awayText,
  changeOf,
  dayText,
  deadlineHint,
  defaultDeadline,
  movable,
  peopleOf,
  perDayFor,
  shortDay,
  splitSummary,
  waveLoad,
  whichLabels,
  workdaysLeft,
} from "./model"

// ---- Header ----

export function WaveHeader({
  model,
  now,
  entry,
  children,
}: {
  model: WaveModel
  now: Date
  entry: "toast" | "storico"
  /** On the right of the title: the deadline, actions */
  children?: React.ReactNode
}) {
  const w = model.wave
  return (
    <header className="flex flex-col gap-2">
      <nav aria-label="Percorso" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-1">
          <li>
            <a href="#import" className="hover:text-foreground hover:underline">
              Import
            </a>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="text-foreground">
            {w.fileName}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-title">{w.name}</h1>
          <p className="text-sm text-muted-foreground">
            Importata {agoText(w.importedOn, now)} · {number(w.customers)}{" "}
            clienti
            {entry === "toast" ? " · import completato" : ""}
          </p>
        </div>
        {children}
      </div>
    </header>
  )
}

// ---- Deadline ----

const presets = (now: Date) => {
  const today = startOfDay(now)
  return [
    { label: "+14 giorni", date: addDays(today, 14) },
    { label: `+${DEFAULT_DAYS} giorni`, date: defaultDeadline(now) },
    { label: "+45 giorni", date: addDays(today, 45) },
    { label: "Fine mese", date: startOfDay(endOfMonth(today)) },
  ]
}

/** «Scadenza»: a day after today, with the shortcuts */
export function DeadlineField({
  id,
  value,
  onChange,
  now,
  label = "Scadenza",
  hideLabel = false,
  prominent = false,
}: {
  id: string
  value: Date
  onChange: (d: Date) => void
  now: Date
  label?: string
  hideLabel?: boolean
  /** Larger, for where the deadline is the decision */
  prominent?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className={cn(
                "justify-start gap-2 font-normal",
                prominent && "h-10 bg-card px-4 text-base"
              )}
              aria-describedby={`${id}-hint`}
            >
              <CalendarDays aria-hidden className="size-4" />
              <span className="font-label">{dayText(value)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="flex flex-wrap gap-1 border-b border-border p-2">
              {presets(now).map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="xs"
                  variant={isSameDay(p.date, value) ? "secondary" : "ghost"}
                  onClick={() => {
                    onChange(p.date)
                    setOpen(false)
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="single"
              locale={it}
              weekStartsOn={1}
              required
              selected={value}
              defaultMonth={value}
              disabled={{ before: addDays(startOfDay(now), 1) }}
              onSelect={(d) => {
                if (!d) return
                onChange(d)
                setOpen(false)
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <span id={`${id}-hint`} className="text-sm text-muted-foreground">
          {deadlineHint(now, value)}
        </span>
      </div>
    </div>
  )
}

/** The deadline as it stands, for the header */
export function DeadlineStatus({
  model,
  now,
}: {
  model: WaveModel
  now: Date
}) {
  const d = model.wave.deadline
  if (d === null) {
    return (
      <span className="text-tag-amber-text font-label text-sm">
        Scadenza da confermare
      </span>
    )
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-sm",
        model.expired ? "text-destructive-text font-label" : "text-foreground"
      )}
    >
      <CalendarDays aria-hidden className="size-4" />
      {model.expired ? (
        <>
          Scaduta {dayText(d)} · {number(model.toDo)} da fare
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Scadenza</span>
          <span className="font-label">{dayText(d)}</span>
          <span className="text-muted-foreground">
            · {deadlineHint(now, d)}
          </span>
        </>
      )}
    </span>
  )
}

/** «Proroga»: a later day, saved at once */
export function ExtendButton({
  model,
  now,
  variant = "secondary",
  size = "sm",
}: {
  model: WaveModel
  now: Date
  variant?: "secondary" | "default"
  size?: "sm" | "lg"
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(() => addDays(startOfDay(now), 14))
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(addDays(startOfDay(now), 14))
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button size={size} variant={variant}>
          Proroga
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <p className="font-label text-sm">Proroga la {model.wave.name}</p>
        <DeadlineField
          id="extend-deadline"
          value={value}
          onChange={setValue}
          now={now}
          label="Nuova scadenza"
        />
        <p className="text-xs text-muted-foreground">
          {number(model.toDo)} contatti ancora da fare restano a chi li ha.
        </p>
        <Button
          size="sm"
          onClick={() => {
            model.saveDeadline(value)
            setOpen(false)
          }}
        >
          Proroga al {shortDay(value)}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function ExpiredBanner({
  model,
  now,
  onReassign,
}: {
  model: WaveModel
  now: Date
  onReassign: () => void
}) {
  if (!model.expired || model.wave.deadline === null) return null
  const holders = model.operators.filter(
    (o) => waveLoad(o, model.wave.id).toCall > 0
  )
  return (
    <div
      role="status"
      className="rounded-control border-destructive-soft-border bg-destructive-soft text-destructive-soft-foreground flex flex-wrap items-center gap-x-4 gap-y-2 border px-4 py-3 text-sm"
    >
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">
        <span className="font-label">
          Scaduta {dayText(model.wave.deadline)}
        </span>{" "}
        ({deadlineHint(now, model.wave.deadline)}) con {number(model.toDo)}{" "}
        contatti ancora da fare presso {holders.length} operatori. Nessuno è
        diventato arretrato: proroga la scadenza o sposta il da fare a chi
        chiama.
      </span>
      <div className="flex gap-2">
        <ExtendButton model={model} now={now} variant="default" />
        <Button size="sm" variant="secondary" onClick={onReassign}>
          Riassegna
        </Button>
      </div>
    </div>
  )
}

// ---- Parts ----

export function Parts({ wave: w }: { wave: WaveRun }) {
  const items = [
    ["bg-primary", "Lavorati", w.worked],
    ["bg-primary/45", "Chiamati senza esito", w.attempted],
    ["bg-muted-foreground/30", "Mai chiamati", w.neverCalled],
    ["bg-tag-amber-dot", "Senza operatore", w.unassigned],
  ] as const
  return (
    <div className="flex flex-col gap-2">
      <WaveBar wave={w} className="h-2.5" />
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {items.map(([color, label, n]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", color)} />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-label tabular-nums">{number(n)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- The split ----

const strategies: Record<Strategy, { label: string; hint: string }> = {
  pace: {
    label: "Ritmo dei 30 giorni precedenti",
    hint: "Di più a chi ha fatto più chiamate al giorno nell'ultimo mese",
  },
  level: {
    label: "Pareggia i carichi",
    hint: "Di più a chi ha meno da fare, finché i carichi si pareggiano",
  },
  equal: { label: "In parti uguali", hint: "Lo stesso numero a ognuno" },
}

export function StrategyField({ split, id }: { split: Split; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="font-label text-sm">
        Come dividere
      </span>
      <RadioGroup
        value={split.strategy}
        onValueChange={(v) => split.pickStrategy(v as Strategy)}
        aria-labelledby={id}
        className="gap-1.5"
      >
        {(Object.keys(strategies) as Strategy[]).map((s) => (
          <div key={s} className="flex items-start gap-2">
            <RadioGroupItem id={`${id}-${s}`} value={s} className="mt-0.5" />
            <Label
              htmlFor={`${id}-${s}`}
              className="flex flex-col items-start gap-0 font-normal"
            >
              <span>{strategies[s].label}</span>
              <span className="text-xs text-muted-foreground">
                {strategies[s].hint}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}

/** For a move: which contacts of the operators chosen */
export function WhichField({
  split,
  waveId,
  id,
}: {
  split: Split
  waveId: string
  id: string
}) {
  return (
    <RadioGroup
      value={split.which}
      onValueChange={(v) => split.pickWhich(v as Which)}
      aria-label="Quali contatti"
      className="gap-2"
    >
      {(Object.keys(whichLabels) as Which[]).map((w) => {
        const n = split.sources.reduce(
          (sum, o) => sum + movable(o, waveId, w),
          0
        )
        return (
          <div key={w} className="flex items-start gap-2">
            <RadioGroupItem
              id={`${id}-${w}`}
              value={w}
              disabled={n === 0}
              className="mt-0.5"
            />
            <Label
              htmlFor={`${id}-${w}`}
              className="flex flex-col items-start gap-0 font-normal"
            >
              <span>
                {whichLabels[w].label}{" "}
                <span className="tabular-nums text-muted-foreground">
                  · {number(n)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {whichLabels[w].hint}
              </span>
            </Label>
          </div>
        )
      })}
    </RadioGroup>
  )
}

export function CountField({ split, id }: { split: Split; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>Quanti</Label>
      <Input
        id={id}
        inputMode="numeric"
        className="w-24 tabular-nums"
        value={split.count ?? String(split.max)}
        onChange={(e) => split.setCount(e.target.value.replace(/\D/g, ""))}
        aria-invalid={
          split.error !== null && split.max > 0 && split.targets.length > 0
        }
        aria-describedby={`${id}-summary`}
      />
      <span className="text-sm text-muted-foreground">
        su {number(split.max)}
      </span>
      {split.count !== null && split.value !== split.max ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => split.setCount(null)}
        >
          Tutti
        </Button>
      ) : null}
    </div>
  )
}

/** For a move from one or more operators: all, N in all, or N from each */
export function HowManyField({ split, id }: { split: Split; id: string }) {
  const many = split.sources.length > 1
  const kinds: HowMany[] = many ? ["all", "total", "each"] : ["all", "total"]
  const options: Record<HowMany, { label: string; hint: string }> = {
    all: {
      label: `Tutti · ${number(split.available)}`,
      hint: many
        ? "Sposti tutti i contatti scelti degli operatori selezionati"
        : "Sposti tutti i contatti scelti dell'operatore selezionato",
    },
    total: many
      ? {
          label: "Un numero totale",
          hint: "Scrivi quanti contatti spostare in tutto. Si prendono da ogni operatore in proporzione a quanti ne ha",
        }
      : {
          label: "Solo una parte",
          hint: "Scrivi quanti contatti spostare",
        },
    each: {
      label: "Lo stesso numero per operatore",
      hint: "Scrivi quanti contatti prendere da ciascuno. A chi ne ha di meno si prendono tutti",
    },
  }
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={split.howMany}
        onValueChange={(v) => split.pickHowMany(v as HowMany)}
        aria-label="Quanti contatti"
        className="gap-2"
      >
        {kinds.map((k) => (
          <div key={k} className="flex items-start gap-2">
            <RadioGroupItem
              id={`${id}-${k}`}
              value={k}
              className="mt-0.5"
              aria-describedby={`${id}-${k}-hint`}
            />
            <div className="flex min-w-0 flex-col">
              <div className="flex min-h-5 flex-wrap items-center gap-2">
                <Label htmlFor={`${id}-${k}`} className="font-normal">
                  {options[k].label}
                </Label>
                {split.howMany === k && k !== "all" ? (
                  <Input
                    aria-label={
                      k === "each"
                        ? "Contatti da prendere a ogni operatore"
                        : "Contatti da spostare in tutto"
                    }
                    inputMode="numeric"
                    className="h-7 w-24 tabular-nums"
                    value={split.count ?? String(split.max)}
                    onChange={(e) =>
                      split.setCount(e.target.value.replace(/\D/g, ""))
                    }
                    aria-invalid={split.error !== null && split.max > 0}
                    autoFocus
                  />
                ) : null}
              </div>
              <span
                id={`${id}-${k}-hint`}
                className="text-xs text-muted-foreground"
              >
                {options[k].hint}
              </span>
            </div>
          </div>
        ))}
      </RadioGroup>
      <ul className="flex flex-col text-sm">
        <li
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-2 border-b border-border pb-1 text-xs text-muted-foreground"
        >
          <span>Operatore</span>
          <span className="text-right">Contatti</span>
          <span className="text-right">Da spostare</span>
        </li>
        {split.sources.map((o, i) => (
          <li
            key={o.id}
            className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-2 border-b border-border py-1.5"
          >
            <span className="truncate">{o.name}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              {number(split.movables[i]!)}
            </span>
            <span className="font-label text-right tabular-nums">
              {split.takes[i] ? number(split.takes[i]) : "—"}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-2 py-1.5">
          <span className="font-label">Totale</span>
          <span />
          <span className="font-label text-right tabular-nums">
            {number(split.value)}
          </span>
        </li>
      </ul>
    </div>
  )
}

export function SplitSummary({
  split,
  operators,
  id,
}: {
  split: Split
  operators: readonly Operator[]
  id: string
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        "text-sm",
        split.plan || split.max === 0
          ? "text-muted-foreground"
          : "text-destructive-text"
      )}
    >
      {splitSummary(split, operators)}
    </p>
  )
}

/** Who has fewer to do first */
const byLoad = (operators: readonly Operator[]) =>
  [...operators].sort((a, b) => a.toCall - b.toCall)

/**
 * One row per person: the checkbox, what they have to do now, the change,
 * after, and the Wave's share a day to the deadline (amber past their pace)
 */
export function SplitRows({
  split,
  operators,
  waveId,
  workdays,
  id: prefix,
  className,
}: {
  split: Split
  operators: readonly Operator[]
  waveId: string
  /** Working days to the deadline, for «Al giorno» */
  workdays: number
  id: string
  className?: string
}) {
  const people = peopleOf(operators).filter(
    (o) => !(split.from ?? []).includes(o.id)
  )
  // Who stopped calling first, apart, so it shows they are left out
  const groups = [
    [
      "Inattivi · esclusi dalla divisione",
      byLoad(people.filter((o) => !isActive(o))),
    ],
    [
      "Operatori",
      byLoad(people.filter((o) => isActive(o) && o.role === "OPERATORE")),
    ],
    ["Admin", byLoad(people.filter((o) => isActive(o) && o.role === "ADMIN"))],
  ] as const
  const cols = "grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_6rem]"
  return (
    <div
      role="group"
      aria-labelledby={`${prefix}-label`}
      className={cn("flex flex-col", className)}
    >
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <p id={`${prefix}-label`} className="font-label text-sm">
          A chi
          <span className="font-sans font-normal text-muted-foreground">
            {" "}
            · {split.targets.length}{" "}
            {split.targets.length === 1 ? "scelto" : "scelti"}
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() =>
              split.setTo(
                operators
                  .filter((o) => o.role === "OPERATORE" && isActive(o))
                  .map((o) => o.id)
              )
            }
          >
            Tutti gli attivi
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => split.setTo([])}
          >
            Nessuno
          </Button>
        </div>
      </div>
      <div
        aria-hidden
        className={cn(
          "grid gap-2 border-b border-border px-1 pb-1 text-xs text-muted-foreground",
          cols
        )}
      >
        <span className="pl-6">Nome</span>
        <span className="text-right">Attive</span>
        <span className="text-right">Assegnate</span>
        <span className="text-right">Totale</span>
        <span className="text-right">Al giorno</span>
      </div>
      <ul className="-mx-1 overflow-y-auto">
        {groups.map(([title, rows], g) =>
          rows.length === 0 ? null : (
            <li key={title}>
              <p
                id={`${prefix}-g${g}`}
                className="font-label px-2 pb-0.5 pt-2 text-xs text-muted-foreground"
              >
                {title}
              </p>
              <ul aria-labelledby={`${prefix}-g${g}`}>
                {rows.map((o) => {
                  const change = changeOf(split.plan, o.id)
                  const load = waveLoad(o, waveId).toCall
                  const id = `${prefix}-${o.id}`
                  const note = !isActive(o)
                    ? awayText(o)
                    : split.strategy === "pace"
                      ? o.perDay === 0
                        ? "nessuna chiamata negli ultimi 30 giorni"
                        : `${o.perDay} chiamate al giorno`
                      : null
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "grid items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent",
                        cols
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={split.to.includes(o.id)}
                          onCheckedChange={(on) =>
                            split.toggle(o.id, on === true)
                          }
                        />
                        <Label
                          htmlFor={id}
                          className="flex min-w-0 flex-col items-start gap-0 font-normal"
                        >
                          <span className="max-w-full truncate">{o.name}</span>
                          {note ? (
                            <span
                              className={cn(
                                "text-xs",
                                isActive(o)
                                  ? "text-muted-foreground"
                                  : "text-tag-amber-text"
                              )}
                            >
                              {note}
                            </span>
                          ) : null}
                        </Label>
                      </div>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {number(o.toCall)}
                      </span>
                      <span
                        className={cn(
                          "text-right tabular-nums",
                          change > 0 && "text-tag-green-text font-medium",
                          change < 0 && "text-destructive-text font-medium",
                          change === 0 && "text-muted-foreground"
                        )}
                      >
                        {change > 0
                          ? `+${number(change)}`
                          : change < 0
                            ? `−${number(-change)}`
                            : "—"}
                      </span>
                      <span className="text-right tabular-nums">
                        {change === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          number(o.toCall + change)
                        )}
                      </span>
                      <span
                        title={`${number(load + change)} della Wave in ${workdays} giorni lavorativi`}
                        className={cn(
                          "text-right tabular-nums",
                          load + change === 0
                            ? "text-muted-foreground"
                            : isActive(o) &&
                                perDayFor(load + change, workdays) > o.perDay
                              ? "text-tag-amber-text font-medium"
                              : "text-muted-foreground"
                        )}
                      >
                        {perDayFor(load + change, workdays) || "—"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

// ---- Who has the Wave ----

export type DistributionRow = {
  operator: Operator
  toDo: number
  never: number
  noAnswer: number
}

/** Who has the Wave's «da fare»: who stopped first, then the most */
export function distributionOf(model: WaveModel): DistributionRow[] {
  const w = model.wave
  return peopleOf(model.operators)
    .map((o) => {
      const l = waveLoad(o, w.id)
      return {
        operator: o,
        toDo: l.toCall,
        never: l.neverCalled,
        noAnswer: l.toCall - l.neverCalled,
      }
    })
    .filter((r) => r.toDo > 0 || r.operator.role === "OPERATORE")
    .sort(
      (a, b) =>
        Number(isActive(a.operator)) - Number(isActive(b.operator)) ||
        b.toDo - a.toDo
    )
}

/** Working days the split's «al giorno» divides by */
export const workdaysFor = (model: WaveModel, now: Date) =>
  workdaysLeft(now, model.wave.deadline ?? model.draftDeadline)
