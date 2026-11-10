// The divisions of the Wave page (spec assegnazione-wave, AC11 and AC24). Each
// one returns the shares in the order of the people it was given, and the
// shares always add up to the number to divide. Units left over go by the
// order of name: Italian alphabetical, then the user's id.

/**
 * A person as the order of name wants them: the name as shown and the user's
 * id, compared as a string as the server's blocks of the Wave compare it
 */
type Named = { readonly userId: string; readonly name: string }

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

/** Italian alphabetical order of the name, ties by user id (Definizioni) */
export const byName = (a: Named, b: Named) =>
  a.name.localeCompare(b.name, "it") ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)

/** Indexes of `people` in the order of name */
const nameOrder = (people: readonly Named[]) =>
  people.map((_, i) => i).sort((a, b) => byName(people[a]!, people[b]!))

// Fractions of different weights meet in floating point: two within this are
// the same
const EPSILON = 1e-9

/**
 * `total` split by `weights`, the integer part first, the units left one each
 * to the highest fractional part, ties in the order of name. Without any weight
 * it divides equally.
 */
function largestRemainder(
  total: number,
  people: readonly Named[],
  weights: readonly number[]
): number[] {
  if (people.length === 0) return []
  const all = sum(weights)
  if (all <= 0) return splitEqually(total, people)
  const exact = weights.map((w) => (total * w) / all)
  const parts = exact.map((e) => Math.floor(e + EPSILON))
  let rest = total - sum(parts)
  const order = nameOrder(people)
    .map((i) => [Math.max(0, exact[i]! - parts[i]!), i] as const)
    .sort(
      (a, b) => (Math.abs(a[0] - b[0]) < EPSILON ? 0 : b[0] - a[0]) // stable: name order stays
    )
  for (const [, i] of order) {
    if (rest <= 0) break
    parts[i]! += 1
    rest -= 1
  }
  return parts
}

/** «Ritmo dei 30 giorni precedenti» (AC11): by the exact pace */
export function splitByPace(
  total: number,
  people: readonly (Named & { readonly pace: number })[]
): number[] {
  return largestRemainder(
    total,
    people,
    people.map((p) => p.pace)
  )
}

/** «In parti uguali» (AC11) */
export function splitEqually(
  total: number,
  people: readonly Named[]
): number[] {
  if (people.length === 0) return []
  const base = Math.floor(total / people.length)
  const parts = people.map(() => base)
  let rest = total - base * people.length
  for (const i of nameOrder(people)) {
    if (rest <= 0) break
    parts[i]! += 1
    rest -= 1
  }
  return parts
}

/**
 * «Pareggia i carichi» (AC11): the highest whole level L that costs at most
 * `total` to bring every person with `active` under L up to L; each gets
 * L - `active`. The units left go one each, among who is now at L (so with the
 * lowest «Totale», all equal), in the order of name: fewer than them are left.
 */
export function levelUp(
  total: number,
  people: readonly (Named & { readonly active: number })[]
): number[] {
  if (people.length === 0) return []
  const cost = (level: number) =>
    sum(people.map((p) => Math.max(0, level - p.active)))
  let lo = Math.min(...people.map((p) => p.active))
  let hi = Math.max(...people.map((p) => p.active)) + total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (cost(mid) <= total) lo = mid
    else hi = mid - 1
  }
  const parts = people.map((p) => Math.max(0, lo - p.active))
  let rest = total - sum(parts)
  const order = nameOrder(people).filter((i) => people[i]!.active <= lo)
  for (const i of order) {
    if (rest <= 0) break
    parts[i]! += 1
    rest -= 1
  }
  return parts
}

type Holder = Named & { readonly contacts: number }

/**
 * «Un numero totale» of the transfer (AC24): each holder gives the integer
 * part of `total` × their contacts / all the contacts, the units left one each
 * to the highest fractional part, ties in the order of name. Never more than
 * a holder has.
 */
export function shareProportionally(
  total: number,
  holders: readonly Holder[]
): number[] {
  const all = sum(holders.map((h) => h.contacts))
  return largestRemainder(
    Math.min(total, all),
    holders,
    holders.map((h) => h.contacts)
  )
}

/** «Lo stesso numero per operatore» (AC24): `n`, or all they have if less */
export function takeSame(n: number, holders: readonly Holder[]): number[] {
  return holders.map((h) => Math.min(n, h.contacts))
}
