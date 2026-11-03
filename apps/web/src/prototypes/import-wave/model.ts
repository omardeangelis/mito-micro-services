// The Wave as the admin works it: its deadline, who has its
// contacts, and the two moves, assigning the clients without an operator and
// moving the «da fare» (Da chiamare and Non risponde) of one or more
// operators to others. Fake: the real moves follow «Assegna Clienti» (state,
// alert and chat stay).

import * as React from "react"
import {
  addDays,
  differenceInCalendarDays,
  format,
  isWeekend,
  startOfDay,
} from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"
import { number } from "../home-operatore/shared"
import { type Operator, isActive, split } from "../home-admin/fixtures"
import { type Plan, type Strategy, planOf } from "../home-admin/team"
import { type WaveRun, type WaveScenario } from "./fixtures"

export type { Plan, Strategy }

export const DEFAULT_DAYS = 30

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

// ---- Dates ----

export const defaultDeadline = (now: Date) =>
  addDays(startOfDay(now), DEFAULT_DAYS)

/** Working days from tomorrow to the deadline, both ends counted */
export function workdaysLeft(now: Date, deadline: Date) {
  let n = 0
  for (let d = addDays(startOfDay(now), 1); d <= deadline; d = addDays(d, 1)) {
    if (!isWeekend(d)) n += 1
  }
  return n
}

/** «mer 3 dic» */
export const dayText = (d: Date) => format(d, "EEE d MMM", { locale: it })

/** «3/12» */
export const shortDay = (d: Date) => format(d, "d/M")

export const isExpired = (deadline: Date | null, now: Date) =>
  deadline !== null && differenceInCalendarDays(deadline, now) < 0

export function deadlineHint(now: Date, deadline: Date) {
  const days = differenceInCalendarDays(deadline, now)
  if (days < 0)
    return days === -1 ? "scaduta ieri" : `scaduta da ${-days} giorni`
  if (days === 0) return "scade oggi"
  const w = workdaysLeft(now, deadline)
  return `${w} ${w === 1 ? "giorno lavorativo" : "giorni lavorativi"}`
}

// ---- Who has what ----

export const waveLoad = (o: Operator, waveId: string) =>
  o.byWave[waveId] ?? { toCall: 0, neverCalled: 0 }

/** Who can get contacts: the operators, and the admins who call or have some */
export const peopleOf = (operators: readonly Operator[]) =>
  operators.filter(
    (o) => o.role === "OPERATORE" || o.perDay > 0 || o.toCall > 0
  )

/** Who the split chooses at the start: every operator who calls */
export const activeOperators = (operators: readonly Operator[]) =>
  operators
    .filter((o) => o.role === "OPERATORE" && isActive(o))
    .map((o) => o.id)

/** A day's share of one operator's Wave to finish by the deadline; 0 when no day is left */
export const perDayFor = (toDo: number, workdays: number) =>
  workdays <= 0 ? 0 : Math.ceil(toDo / workdays)

export function awayText(o: Operator) {
  return o.away === 1 ? "ultima chiamata ieri" : `inattivo da ${o.away} giorni`
}

export const firstName = (o: Operator) => o.name.split(" ")[0]!

export const andText = (names: readonly string[]) =>
  names.join(", ").replace(/, ([^,]*)$/, " e $1")

/** What a plan does to one operator: +N, −N or nothing */
export const changeOf = (plan: Plan | null, id: number) =>
  (plan?.give.get(id) ?? 0) - (plan?.take.get(id) ?? 0)

// ---- The split ----

/** What the moving takes from the operators */
export type Which = "all" | "never" | "noAnswer"

export const whichLabels: Record<Which, { label: string; hint: string }> = {
  all: {
    label: "Da chiamare e Non risponde",
    hint: "Tutti i contatti che l'operatore deve ancora lavorare",
  },
  never: {
    label: "Solo Da chiamare",
    hint: "Clienti che l'operatore non ha mai chiamato",
  },
  noAnswer: {
    label: "Solo Non risponde",
    hint: "Clienti già chiamati che non hanno risposto. I tentativi fatti restano registrati",
  },
}

export function movable(o: Operator, waveId: string, which: Which) {
  const l = waveLoad(o, waveId)
  return which === "all"
    ? l.toCall
    : which === "never"
      ? l.neverCalled
      : l.toCall - l.neverCalled
}

/**
 * How many to move from the operators chosen:
 * - `all`: everything
 * - `total`: N in all, from each in proportion to what they have
 * - `each`: N from each, or all they have when fewer
 */
export type HowMany = "all" | "total" | "each"

type Draft = {
  which: Which
  howMany: HowMany
  strategy: Strategy
  to: readonly number[]
  /** What was typed; null means all of them */
  count: string | null
}

/**
 * The split of the clients without an operator (`from` null), or of the «da
 * fare» of the operators in `from`
 */
export function useSplit({
  wave,
  operators,
  from,
}: {
  wave: WaveRun
  operators: readonly Operator[]
  from: readonly number[] | null
}) {
  const start = (): Draft => ({
    which: "all",
    howMany: "all",
    strategy: "pace",
    to: activeOperators(operators),
    count: null,
  })
  const [draft, setDraft] = React.useState(start)

  const sources = (from ?? [])
    .map((id) => operators.find((o) => o.id === id))
    .filter((o): o is Operator => o !== undefined)
  const movables = sources.map((o) => movable(o, wave.id, draft.which))
  const available = from === null ? wave.unassigned : sum(movables)
  // The most the field accepts: per operator with «each»
  const max =
    from !== null && draft.howMany === "each"
      ? Math.max(0, ...movables)
      : available
  const typed =
    draft.howMany === "all" || draft.count === null ? max : Number(draft.count)
  const valid =
    draft.howMany === "all" ||
    (draft.count !== "" && Number.isInteger(typed) && typed >= 1)
  const tooMany = valid && typed > max

  const takes =
    from === null
      ? []
      : draft.howMany === "all" || (draft.howMany === "total" && typed >= max)
        ? movables
        : draft.howMany === "total"
          ? split(typed, movables)
          : movables.map((m) => Math.min(m, typed))
  const value = from === null ? typed : sum(takes)
  const targets = draft.to.filter((id) => !(from ?? []).includes(id))

  const plan: Plan | null =
    valid && !tooMany && value > 0 && targets.length > 0
      ? (() => {
          const p = planOf({
            wave: { ...wave, unassigned: value },
            kind: "unassigned",
            strategy: draft.strategy,
            operators,
            to: targets,
            count: value,
          })
          return from === null
            ? p
            : {
                ...p,
                take: new Map(
                  sources
                    .map((o, i) => [o.id, takes[i]!] as const)
                    .filter(([, n]) => n > 0)
                ),
              }
        })()
      : null

  const error =
    available === 0
      ? from === null
        ? "Nessun cliente della Wave senza operatore"
        : sources.length === 0
          ? "Scegli almeno un operatore da cui prendere"
          : "Niente da spostare"
      : targets.length === 0
        ? "Scegli almeno un operatore a cui dare"
        : !valid || tooMany
          ? `Da 1 a ${number(max)}`
          : null

  return {
    ...draft,
    from,
    sources,
    movables,
    takes,
    available,
    max,
    value,
    plan,
    error,
    targets,
    reset: () => setDraft(start()),
    pickWhich: (which: Which) =>
      setDraft((d) => ({ ...d, which, count: null })),
    pickHowMany: (howMany: HowMany) =>
      setDraft((d) => ({ ...d, howMany, count: null })),
    pickStrategy: (strategy: Strategy) => setDraft((d) => ({ ...d, strategy })),
    setTo: (next: readonly number[]) => setDraft((d) => ({ ...d, to: next })),
    toggle: (id: number, on: boolean) =>
      setDraft((d) => ({
        ...d,
        to: on ? [...d.to, id] : d.to.filter((x) => x !== id),
      })),
    setCount: (count: string | null) => setDraft((d) => ({ ...d, count })),
  }
}

export type Split = ReturnType<typeof useSplit>

/** What the split does, in one line */
export function splitSummary(split: Split, operators: readonly Operator[]) {
  const { plan } = split
  if (!plan) return split.error ?? ""
  const shares = [...plan.give.values()]
  const after = operators
    .filter((o) => plan.give.has(o.id))
    .map((o) => o.toCall + changeOf(plan, o.id))
  const low = Math.min(...shares)
  const high = Math.max(...shares)
  const left = split.targets.length - shares.length
  return `${
    left > 0
      ? `Ricevono ${shares.length} dei ${split.targets.length} scelti. `
      : ""
  }${
    shares.length === 1
      ? number(low)
      : low === high
        ? `${number(low)} a testa`
        : `Da ${number(low)} a ${number(high)} a testa`
  } · dopo, ${
    Math.min(...after) === Math.max(...after)
      ? `${number(after[0]!)} da fare${after.length > 1 ? " a testa" : ""}`
      : `tra ${number(Math.min(...after))} e ${number(Math.max(...after))} da fare`
  }`
}

export function submitText(split: Split) {
  const verb = split.from === null ? "Assegna" : "Sposta"
  if (!split.plan) return verb
  const n = split.plan.give.size
  return `${verb} ${number(split.value)} a ${n} ${n === 1 ? "operatore" : "operatori"}`
}

// ---- The Wave ----

export function useWave(scenario: WaveScenario, now: Date) {
  const [operators, setOperators] = React.useState(scenario.operators)
  const [base, setBase] = React.useState(scenario.wave)
  /** The deadline shown before it is saved: today + 30 */
  const [draftDeadline, setDraftDeadline] = React.useState<Date>(
    scenario.wave.deadline ?? defaultDeadline(now)
  )

  // A Wave's parts are the sum of its operators'
  const wave = React.useMemo<WaveRun>(() => {
    const loads = operators.map((o) => waveLoad(o, base.id))
    const neverCalled = sum(loads.map((l) => l.neverCalled))
    const toCall = sum(loads.map((l) => l.toCall))
    return { ...base, neverCalled, attempted: toCall - neverCalled }
  }, [base, operators])

  const saveDeadline = (deadline: Date, quiet = false) => {
    const before = base.deadline
    setBase((w) => ({ ...w, deadline }))
    setDraftDeadline(deadline)
    if (quiet) return
    toast(
      before === null
        ? `Scadenza della ${base.name}: ${dayText(deadline)}`
        : `Scadenza della ${base.name} spostata al ${dayText(deadline)}`,
      {
        description:
          before && before < deadline
            ? `Prima era ${dayText(before)}. Gli operatori la vedono subito nella home`
            : "Gli operatori la vedono subito nella home",
      }
    )
  }

  const apply = (plan: Plan, which: Which = "all") => {
    if (plan.count === 0) return
    const from = operators.filter((o) => plan.take.has(o.id))
    // How many of each source's were never called
    const neverLost = new Map(
      from.map((o) => {
        const lost = plan.take.get(o.id)!
        return [
          o.id,
          which === "never"
            ? lost
            : which === "noAnswer"
              ? 0
              : Math.min(lost, waveLoad(o, base.id).neverCalled),
        ] as const
      })
    )
    const movedNever =
      from.length === 0 ? plan.count : sum([...neverLost.values()])
    const ids = [...plan.give.keys()]
    const nevers = split(
      movedNever,
      ids.map((id) => plan.give.get(id)!)
    )
    const neverTo = new Map(ids.map((id, i) => [id, nevers[i]!]))

    setOperators((current) =>
      current.map((o) => {
        const got = plan.give.get(o.id) ?? 0
        const lost = plan.take.get(o.id) ?? 0
        if (got === 0 && lost === 0) return o
        const l = waveLoad(o, base.id)
        const never = (neverTo.get(o.id) ?? 0) - (neverLost.get(o.id) ?? 0)
        return {
          ...o,
          toCall: o.toCall + got - lost,
          neverCalled: o.neverCalled + never,
          byWave: {
            ...o.byWave,
            [base.id]: {
              toCall: l.toCall + got - lost,
              neverCalled: l.neverCalled + never,
            },
          },
        }
      })
    )
    if (from.length === 0) {
      setBase((w) => ({
        ...w,
        unassigned: w.unassigned - plan.count,
        deadline: w.deadline ?? draftDeadline,
      }))
    }
  }

  const expired = isExpired(wave.deadline, now)
  const toDo = wave.neverCalled + wave.attempted
  return {
    operators,
    wave,
    draftDeadline,
    setDraftDeadline,
    saveDeadline,
    apply,
    expired,
    toDo,
  }
}

export type WaveModel = ReturnType<typeof useWave>
