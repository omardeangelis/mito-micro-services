// The team as the admin sees it: the operators and the Wave. Assigning moves
// contacts of a Wave to the operators chosen: the clients without an operator
// get a contact to call, or the contacts never called leave the operators who
// have them now (who stopped calling first, then who has the most). The split
// evens out the loads by default. Fake: the real assignment follows the cases
// of guida-assegnazione-massiva-e-alert.md §3.

import * as React from "react"
import { toast } from "sonner"
import { number } from "../home-operatore/shared"
import {
  type AdminScenario,
  type Operator,
  type Wave,
  isActive,
  split,
} from "./fixtures"

export type AssignKind = "unassigned" | "neverCalled"

/**
 * - `level`: more to who has fewer to call, until the loads are even
 * - `pace`: in proportion to the calls a day of the last 30 days
 * - `equal`: the same to each
 */
export type Strategy = "level" | "pace" | "equal"

export type Plan = {
  waveId: string
  kind: AssignKind
  count: number
  /** Operator → contacts they get */
  give: ReadonlyMap<number, number>
  /** Operator → contacts they lose (never called, reassigned) */
  take: ReadonlyMap<number, number>
}

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

const byName = (names: readonly string[]) => (a: number, b: number) =>
  names[a]!.localeCompare(names[b]!, "it")

/**
 * `count` added to the lowest `loads` first, until they are level; the units
 * left one each to the lowest after, by name (spec AC17)
 */
function levelUp(
  loads: readonly number[],
  names: readonly string[],
  count: number
): number[] {
  if (loads.length === 0) return []
  const room = (t: number) => sum(loads.map((l) => Math.max(0, t - l)))
  // The lowest level t that takes them all
  let lo = Math.min(...loads)
  let hi = Math.max(...loads) + count
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (room(mid) >= count) hi = mid
    else lo = mid + 1
  }
  const give = loads.map((l) => Math.max(0, lo - 1 - l))
  let rest = count - sum(give)
  // Who was below the level is now one under it: the units left go by name
  const order = loads
    .map((_, i) => i)
    .filter((i) => loads[i]! < lo)
    .sort(byName(names))
  for (const i of order) {
    if (rest === 0) break
    give[i]! += 1
    rest -= 1
  }
  return give
}

/**
 * `count` taken from the highest `loads` first, at most `caps` each; the units
 * left from the highest after, by name (spec AC19)
 */
function levelDown(
  loads: readonly number[],
  caps: readonly number[],
  names: readonly string[],
  count: number
): number[] {
  const can = (t: number) =>
    loads.map((l, i) => Math.min(caps[i]!, Math.max(0, l - t)))
  // The highest level t that still gives them all
  let lo = 0
  let hi = Math.max(0, ...loads)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (sum(can(mid)) >= count) lo = mid
    else hi = mid - 1
  }
  const take = can(lo + 1)
  const more = can(lo)
  let rest = count - sum(take)
  const order = loads.map((_, i) => i).sort(byName(names))
  for (const i of order) {
    if (rest === 0) break
    if (take[i]! < more[i]!) {
      take[i]! += 1
      rest -= 1
    }
  }
  return take
}

const neverCalledOf = (o: Operator, waveId: string) =>
  o.byWave[waveId]?.neverCalled ?? 0

/** How many the form can move: never called ones only from the others */
export function available(
  wave: Wave,
  kind: AssignKind,
  operators: readonly Operator[],
  to: readonly number[]
) {
  if (kind === "unassigned") return wave.unassigned
  return sum(
    operators
      .filter((o) => !to.includes(o.id))
      .map((o) => neverCalledOf(o, wave.id))
  )
}

export function planOf({
  wave,
  kind,
  strategy,
  operators,
  to,
  count,
}: {
  wave: Wave
  kind: AssignKind
  strategy: Strategy
  operators: readonly Operator[]
  to: readonly number[]
  count: number
}): Plan {
  const targets = operators.filter((o) => to.includes(o.id))
  const shares =
    strategy === "level"
      ? levelUp(
          targets.map((o) => o.toCall),
          targets.map((o) => o.name),
          count
        )
      : strategy === "pace" && targets.some((o) => o.perDay > 0)
        ? split(
            count,
            targets.map((o) => o.perDay)
          )
        : split(
            count,
            targets.map(() => 1)
          )
  // Only who gets something: levelling can leave some of the chosen out
  const give = new Map(
    targets.map((o, i) => [o.id, shares[i]!] as const).filter(([, n]) => n > 0)
  )

  const take = new Map<number, number>()
  if (kind === "neverCalled") {
    const holders = operators.filter(
      (o) => !to.includes(o.id) && neverCalledOf(o, wave.id) > 0
    )
    // Who stopped calling gives theirs first, the most first
    let rest = count
    for (const o of holders
      .filter((o) => !isActive(o))
      .sort(
        (a, b) =>
          neverCalledOf(b, wave.id) - neverCalledOf(a, wave.id) ||
          a.name.localeCompare(b.name, "it")
      )) {
      if (rest === 0) break
      const n = Math.min(rest, neverCalledOf(o, wave.id))
      take.set(o.id, n)
      rest -= n
    }
    const active = holders.filter(isActive)
    const taken = levelDown(
      active.map((o) => o.toCall),
      active.map((o) => neverCalledOf(o, wave.id)),
      active.map((o) => o.name),
      rest
    )
    active.forEach((o, i) => {
      if (taken[i]! > 0) take.set(o.id, taken[i]!)
    })
  }
  return { waveId: wave.id, kind, count, give, take }
}

/** The Wave with the most clients without an operator, else the most never called */
export const bestWave = (waves: readonly Wave[]) =>
  [...waves].sort(
    (a, b) => b.unassigned - a.unassigned || b.neverCalled - a.neverCalled
  )[0]

const andText = (names: readonly string[]) =>
  names.join(", ").replace(/, ([^,]*)$/, " e $1")

const firstName = (o: Operator) => o.name.split(" ")[0]!

export function useTeam(scenario: AdminScenario) {
  const [operators, setOperators] = React.useState<Operator[]>(
    scenario.operators
  )
  const [base, setBase] = React.useState<Wave[]>(scenario.waves)

  // A Wave's never called are the sum of its operators'
  const waves = React.useMemo(
    () =>
      base.map((w) => ({
        ...w,
        neverCalled: sum(operators.map((o) => neverCalledOf(o, w.id))),
      })),
    [base, operators]
  )

  const assign = (plan: Plan) => {
    const wave = waves.find((w) => w.id === plan.waveId)
    if (!wave || plan.count === 0) return
    const move = (o: Operator, n: number): Operator => {
      const load = o.byWave[plan.waveId] ?? { toCall: 0, neverCalled: 0 }
      return {
        ...o,
        toCall: o.toCall + n,
        neverCalled: o.neverCalled + n,
        byWave: {
          ...o.byWave,
          [plan.waveId]: {
            toCall: load.toCall + n,
            neverCalled: load.neverCalled + n,
          },
        },
      }
    }
    setOperators((current) =>
      current.map((o) =>
        move(o, (plan.give.get(o.id) ?? 0) - (plan.take.get(o.id) ?? 0))
      )
    )
    if (plan.kind === "unassigned") {
      setBase((current) =>
        current.map((w) =>
          w.id === plan.waveId
            ? { ...w, unassigned: w.unassigned - plan.count }
            : w
        )
      )
    }

    const got = operators.filter((o) => (plan.give.get(o.id) ?? 0) > 0)
    const shares = got.map((o) => plan.give.get(o.id)!)
    const low = Math.min(...shares)
    const high = Math.max(...shares)
    const to =
      got.length <= 3
        ? `A ${andText(got.map(firstName))}`
        : `A ${got.length} operatori, ${
            low === high
              ? `${number(low)} a testa`
              : `da ${number(low)} a ${number(high)} a testa`
          }`
    const from = operators
      .filter((o) => plan.take.has(o.id))
      .sort(
        (a, b) =>
          plan.take.get(b.id)! - plan.take.get(a.id)! ||
          a.name.localeCompare(b.name, "it")
      )
    const one = plan.count === 1
    toast(
      `${plan.kind === "unassigned" ? "Assegnat" : "Riassegnat"}${
        one ? "o" : "i"
      } ${number(plan.count)} ${one ? "contatto" : "contatti"} della ${
        wave.name
      }`,
      {
        description:
          from.length === 0
            ? to
            : `${to}. Tolti a ${
                from.length <= 2
                  ? andText(from.map(firstName))
                  : `${firstName(from[0]!)} e altri ${from.length - 1}`
              }`,
      }
    )
  }

  return { operators, waves, assign }
}
