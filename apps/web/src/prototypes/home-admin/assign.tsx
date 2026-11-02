// "Assegna": which Wave, which contacts (the clients without an operator, or
// the contacts never called that someone else has), how to split them, to
// whom and how many. Every operator's row shows what they have now, what they
// get or lose and what they will have, before anything moves.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { number } from "../home-operatore/shared"
import { type Operator, type Wave, isActive } from "./fixtures"
import {
  type AssignKind,
  type Plan,
  type Strategy,
  available,
  bestWave,
  planOf,
} from "./team"

const strategies: Record<Strategy, { label: string; hint: string }> = {
  level: {
    label: "Pareggia i carichi",
    hint: "Di più a chi ha meno da chiamare, finché i carichi si pareggiano",
  },
  pace: {
    label: "Secondo il ritmo",
    hint: "In proporzione alle chiamate al giorno degli ultimi 30 giorni",
  },
  equal: {
    label: "In parti uguali",
    hint: "Lo stesso numero a ognuno",
  },
}

type Draft = {
  waveId: string
  kind: AssignKind
  strategy: Strategy
  to: readonly number[]
  /** What was typed; null means all of them */
  count: string | null
}

const kindFor = (w: Wave | undefined): AssignKind =>
  w && w.unassigned > 0 ? "unassigned" : "neverCalled"

function useAssignDraft({
  waves,
  operators,
  wave: initialWave,
  to: initialTo,
}: {
  waves: readonly Wave[]
  operators: readonly Operator[]
  wave?: Wave | undefined
  /** Who is chosen at the start: every active operator when missing */
  to?: readonly number[]
}) {
  const start = (): Draft => {
    const w = initialWave ?? bestWave(waves)
    return {
      waveId: w?.id ?? "",
      kind: kindFor(w),
      strategy: "pace",
      to: initialTo ?? activeOperators(operators),
      count: null,
    }
  }
  const [draft, setDraft] = React.useState(start)

  const wave = waves.find((w) => w.id === draft.waveId)
  const max = wave ? available(wave, draft.kind, operators, draft.to) : 0
  const value = draft.count === null ? max : Number(draft.count)
  const valid =
    draft.count === "" ? false : Number.isInteger(value) && value >= 1
  const tooMany = valid && value > max
  const plan =
    wave && valid && !tooMany && draft.to.length > 0
      ? planOf({
          wave,
          kind: draft.kind,
          strategy: draft.strategy,
          operators,
          to: draft.to,
          count: value,
        })
      : null

  return {
    ...draft,
    wave,
    max,
    value,
    plan,
    error:
      max === 0
        ? draft.kind === "unassigned"
          ? "Nessun cliente della Wave senza operatore"
          : "Nessun contatto da togliere: gli scelti hanno tutti i mai chiamati della Wave"
        : draft.to.length === 0
          ? "Scegli almeno un operatore"
          : !valid || tooMany
            ? `Da 1 a ${number(max)}`
            : null,
    reset: () => setDraft(start()),
    pickWave: (id: string) =>
      setDraft((d) => ({
        ...d,
        waveId: id,
        kind: kindFor(waves.find((w) => w.id === id)),
        count: null,
      })),
    pickKind: (kind: AssignKind) =>
      setDraft((d) => ({ ...d, kind, count: null })),
    pickStrategy: (strategy: Strategy) => setDraft((d) => ({ ...d, strategy })),
    setTo: (to: readonly number[]) => setDraft((d) => ({ ...d, to })),
    toggle: (id: number, on: boolean) =>
      setDraft((d) => ({
        ...d,
        to: on ? [...d.to, id] : d.to.filter((x) => x !== id),
      })),
    setCount: (count: string | null) => setDraft((d) => ({ ...d, count })),
  }
}

type AssignDraft = ReturnType<typeof useAssignDraft>

/** Who has fewer contacts first; who stopped calling at the end */
const byLoad = (operators: readonly Operator[]) =>
  [...operators].sort(
    (a, b) => Number(!isActive(a)) - Number(!isActive(b)) || a.toCall - b.toCall
  )

/** Who "Tutti gli attivi" chooses, and who is chosen at the start: no admins */
const activeOperators = (operators: readonly Operator[]) =>
  operators
    .filter((o) => o.role === "OPERATORE" && isActive(o))
    .map((o) => o.id)

/** What the plan does to one operator: +N, −N or nothing */
const changeOf = (plan: Plan | null, id: number) =>
  (plan?.give.get(id) ?? 0) - (plan?.take.get(id) ?? 0)

export function awayText(o: Operator) {
  return o.away === 1 ? "ultima chiamata ieri" : `fermo da ${o.away} giorni`
}

// ---- The controls ----

function WaveField({
  draft,
  waves,
  id,
}: {
  draft: AssignDraft
  waves: readonly Wave[]
  id: string
}) {
  const choices = waves.filter((w) => w.unassigned + w.neverCalled > 0)
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Wave</Label>
      <Select value={draft.waveId} onValueChange={draft.pickWave}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Scegli la Wave" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function KindField({ draft, id }: { draft: AssignDraft; id: string }) {
  const w = draft.wave
  if (!w) return null
  return (
    <RadioGroup
      value={draft.kind}
      onValueChange={(v) => draft.pickKind(v as AssignKind)}
      aria-label="Quali contatti"
      className="gap-2"
    >
      <KindOption
        id={`${id}-unassigned`}
        value="unassigned"
        count={w.unassigned}
        title="Senza operatore"
        hint="Clienti della Wave che nessuno ha da chiamare"
      />
      <KindOption
        id={`${id}-never`}
        value="neverCalled"
        count={w.neverCalled}
        title="Assegnati e mai chiamati"
        hint="Li toglie a chi è fermo, poi a chi ha più da chiamare"
      />
    </RadioGroup>
  )
}

function KindOption({
  id,
  value,
  count,
  title,
  hint,
}: {
  id: string
  value: AssignKind
  count: number
  title: string
  hint: string
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem
        id={id}
        value={value}
        disabled={count === 0}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className="flex flex-col items-start gap-0 font-normal"
      >
        <span>
          <span className="font-label">{title}</span>{" "}
          <span className="tabular-nums text-muted-foreground">
            · {number(count)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </Label>
    </div>
  )
}

function StrategyField({ draft, id }: { draft: AssignDraft; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="font-label text-sm">
        Come dividere
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={draft.strategy}
        onValueChange={(v) => v && draft.pickStrategy(v as Strategy)}
        aria-labelledby={id}
        aria-describedby={`${id}-hint`}
        className="w-full"
      >
        {(Object.keys(strategies) as Strategy[]).map((s) => (
          <ToggleGroupItem key={s} value={s} className="flex-1">
            {strategies[s].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {strategies[draft.strategy].hint}
      </p>
    </div>
  )
}

function CountField({ draft, id }: { draft: AssignDraft; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>Quanti</Label>
      <Input
        id={id}
        inputMode="numeric"
        className="w-24 tabular-nums"
        value={draft.count ?? String(draft.max)}
        onChange={(event) =>
          draft.setCount(event.target.value.replace(/\D/g, ""))
        }
        aria-invalid={
          draft.error !== null && draft.to.length > 0 && draft.max > 0
        }
        aria-describedby={`${id}-summary`}
      />
      <span className="text-sm text-muted-foreground">
        su {number(draft.max)}
      </span>
      {draft.count !== null && draft.value !== draft.max ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => draft.setCount(null)}
        >
          Tutti
        </Button>
      ) : null}
    </div>
  )
}

/** What the split does, in one line: the range of shares and of the loads after */
function Summary({
  draft,
  operators,
  id,
}: {
  draft: AssignDraft
  operators: readonly Operator[]
  id: string
}) {
  const { plan } = draft
  let text = draft.error ?? ""
  if (plan) {
    const shares = [...plan.give.values()]
    const after = operators
      .filter((o) => plan.give.has(o.id))
      .map((o) => o.toCall + changeOf(plan, o.id))
    const low = Math.min(...shares)
    const high = Math.max(...shares)
    // Some of the chosen can get nothing: levelling, no rhythm, few to split
    const left = draft.to.length - shares.length
    text = `${
      left > 0
        ? `Ricevono ${shares.length} dei ${draft.to.length} scelti. `
        : ""
    }${
      shares.length === 1
        ? number(low)
        : low === high
          ? `${number(low)} a testa`
          : `Da ${number(low)} a ${number(high)} a testa`
    } · dopo, ${
      Math.min(...after) === Math.max(...after)
        ? `${number(after[0]!)} da chiamare${after.length > 1 ? " a testa" : ""}`
        : `tra ${number(Math.min(...after))} e ${number(
            Math.max(...after)
          )} da chiamare`
    }`
  }
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        "text-sm",
        plan || draft.max === 0
          ? "text-muted-foreground"
          : "text-destructive-text"
      )}
    >
      {text}
    </p>
  )
}

function submitText(draft: AssignDraft) {
  if (!draft.plan) return "Assegna"
  const n = draft.plan.give.size
  return `Assegna ${number(draft.value)} a ${n} ${
    n === 1 ? "operatore" : "operatori"
  }`
}

// ---- Who gets and who gives ----

/** One row per operator: the checkbox, what they have now, the change and what they will have */
function OperatorChanges({
  draft,
  operators,
  id: prefix,
  className,
}: {
  draft: AssignDraft
  operators: readonly Operator[]
  id: string
  className?: string
}) {
  const groups = [
    ["Operatori", byLoad(operators.filter((o) => o.role === "OPERATORE"))],
    ["Admin", byLoad(operators.filter((o) => o.role === "ADMIN"))],
  ] as const
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
            · {draft.to.length} {draft.to.length === 1 ? "scelto" : "scelti"}
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => draft.setTo(activeOperators(operators))}
          >
            Tutti gli attivi
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => draft.setTo([])}
          >
            Nessuno
          </Button>
        </div>
      </div>
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] gap-2 border-b border-border px-1 pb-1 text-xs text-muted-foreground"
      >
        <span className="pl-6">Nome</span>
        <span className="text-right">Ora</span>
        <span className="text-right">Cambia</span>
        <span className="text-right">Dopo</span>
      </div>
      <ul className="-mx-1 overflow-y-auto">
        {groups.map(([title, rows]) =>
          rows.length === 0 ? null : (
            <li key={title}>
              <p
                id={`${prefix}-${title}`}
                className="font-label px-2 pb-0.5 pt-2 text-xs text-muted-foreground"
              >
                {title}
              </p>
              <ul aria-labelledby={`${prefix}-${title}`}>
                {rows.map((o) => (
                  <OperatorChange
                    key={o.id}
                    draft={draft}
                    operator={o}
                    id={`${prefix}-${o.id}`}
                  />
                ))}
              </ul>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

/** Under the name: who stopped, and the rhythm when it decides the split */
function noteOf(o: Operator, pace: boolean) {
  const rhythm =
    o.perDay === 0
      ? "nessuna chiamata negli ultimi 30 giorni"
      : `${o.perDay} ${o.perDay === 1 ? "chiamata" : "chiamate"} al giorno`
  if (!isActive(o)) return pace ? `${awayText(o)} · ${rhythm}` : awayText(o)
  return pace ? rhythm : null
}

function OperatorChange({
  draft,
  operator: o,
  id,
}: {
  draft: AssignDraft
  operator: Operator
  id: string
}) {
  const change = changeOf(draft.plan, o.id)
  const after = o.toCall + change
  const note = noteOf(o, draft.strategy === "pace")
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={id}
          checked={draft.to.includes(o.id)}
          onCheckedChange={(on) => draft.toggle(o.id, on === true)}
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
                isActive(o) ? "text-muted-foreground" : "text-tag-amber-text"
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
          number(after)
        )}
      </span>
    </li>
  )
}

// ---- The popover ----

export function AssignPopover({
  waves,
  operators,
  wave,
  to,
  label,
  onAssign,
}: {
  waves: readonly Wave[]
  operators: readonly Operator[]
  wave: Wave | undefined
  to?: readonly number[]
  /** The accessible name of the trigger: "Assegna dalla Wave 15" */
  label: string
  onAssign: (plan: Plan) => void
}) {
  const [open, setOpen] = React.useState(false)
  const draft = useAssignDraft({ waves, operators, wave, to })
  const nothing = waves.every((w) => w.unassigned + w.neverCalled === 0)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) draft.reset()
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          aria-label={label}
          disabled={
            nothing ||
            (wave !== undefined && wave.unassigned + wave.neverCalled === 0)
          }
        >
          Assegna
        </Button>
      </PopoverTrigger>
      {/* As tall as the room on screen: the list of operators scrolls */}
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="max-h-(--radix-popover-content-available-height) flex w-[30rem] flex-col p-0"
      >
        <form
          className="flex min-h-0 flex-col overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.plan) return
            setOpen(false)
            onAssign(draft.plan)
          }}
        >
          <div className="flex flex-col gap-3 border-b border-border p-3">
            <p className="font-label text-sm">Assegna contatti</p>
            <WaveField draft={draft} waves={waves} id="assign-wave" />
            <KindField draft={draft} id="assign-kind" />
            <StrategyField draft={draft} id="assign-strategy" />
          </div>
          <OperatorChanges
            draft={draft}
            operators={operators}
            id="assign-to"
            className="border-b border-border p-3 [&>ul]:max-h-64"
          />
          <div className="flex flex-col gap-2.5 p-3">
            <CountField draft={draft} id="assign-count" />
            <Summary
              draft={draft}
              operators={operators}
              id="assign-count-summary"
            />
            <Button type="submit" disabled={!draft.plan}>
              {submitText(draft)}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
