import { type WaveView } from "@/api/import"
import { type CountResult } from "@mito/domain/wave/count"
import { levelUp, splitByPace, splitEqually } from "@mito/domain/wave/split"
import { formatNumber, operatorsText, plural } from "../../_lib/text"

/** A person of the team, with what the page shows of them */
export type Member = WaveView["team"][number]

/** The three divisions of «Come dividere» (AC11) */
export type Strategy = "pace" | "level" | "equal"

export const strategies: Record<
  Strategy,
  { readonly label: string; readonly note: string }
> = {
  pace: {
    label: "Ritmo dei 30 giorni precedenti",
    note: "Di più a chi ha fatto più chiamate al giorno nell'ultimo mese",
  },
  level: {
    label: "Pareggia i carichi",
    note: "Di più a chi ha meno da fare, finché i carichi si pareggiano",
  },
  equal: { label: "In parti uguali", note: "Lo stesso numero a ognuno" },
}

/**
 * The messages of the summary when the preview isn't valid (AC14): those of
 * «Assegna», or those of «A chi» in the reassignment
 */
export type Messages = "assign" | "reassign"

export const isInactive = (person: Member) => person.inactiveDays !== null

/** The user id that breaks a tie of names; a row with no user has none */
const userIdOf = (person: Member) => person.userId ?? ""

/**
 * «In ordine di nome» (Definizioni): Italian alphabetical, then the user id,
 * as the server's blocks and the divisions of `@mito/domain/wave/split`
 */
export const byName = (a: Member, b: Member) =>
  a.name.localeCompare(b.name, "it") ||
  (userIdOf(a) < userIdOf(b) ? -1 : userIdOf(a) > userIdOf(b) ? 1 : 0)

/** In each group, who has fewer «Attive» first, ties by name (AC12) */
const byActive = (a: Member, b: Member) => a.active - b.active || byName(a, b)

/** The nome proprio of a person (Definizioni), alone in its text */
export const firstName = (person: Pick<Member, "name">) =>
  person.name.trim().split(/\s+/)[0] ?? person.name

export type Group = {
  readonly id: "inactive" | "operators" | "admins"
  readonly title: string
  readonly people: readonly Member[]
}

/**
 * The list of «A chi» (AC12): the persone mostrate, plus the person of a row
 * of the team (`per`) even when not shown, without who gives (`excluded`).
 * The inactive on top, then the operators, then the admins; empty groups go
 */
export function groupsOf(
  team: readonly Member[],
  {
    per,
    excluded = [],
  }: { per?: number | undefined; excluded?: readonly number[] }
): Group[] {
  const listed = team
    .filter((person) => person.shown || person.operatorId === per)
    .filter((person) => !excluded.includes(person.operatorId))
  const sorted = (people: Member[]) => people.sort(byActive)
  const inactive = sorted(listed.filter(isInactive))
  const chosenInactive =
    per !== undefined && inactive.some((person) => person.operatorId === per)
  const groups: Group[] = [
    {
      id: "inactive",
      title: chosenInactive
        ? "Inattivi"
        : "Inattivi · non scelti, si possono scegliere",
      people: inactive,
    },
    {
      id: "operators",
      title: "Operatori",
      people: sorted(
        listed.filter((p) => !isInactive(p) && p.role === "OPERATORE")
      ),
    },
    {
      id: "admins",
      title: "Admin",
      people: sorted(
        listed.filter((p) => !isInactive(p) && p.role === "ADMIN")
      ),
    },
  ]
  return groups.filter((group) => group.people.length > 0)
}

/** «Tutti gli attivi» (AC12): every active `OPERATORE` of the list */
export const allActive = (groups: readonly Group[]) =>
  groups
    .flatMap((group) => group.people)
    .filter((p) => !isInactive(p) && p.role === "OPERATORE")
    .map((p) => p.operatorId)

/**
 * Chosen when the step opens (AC2, AC12): the person of the row of the team
 * alone, otherwise every active `OPERATORE` of the list
 */
export const initialChoice = (
  groups: readonly Group[],
  per: number | undefined
): number[] => (per !== undefined ? [per] : allActive(groups))

/** One receiver of the preview: the person and how many they get */
export type Share = { readonly operatorId: number; readonly count: number }

/**
 * What the step would do (AC14, AC15). Valid: the number to divide, the
 * division and what each chosen person gets (0 too), in the order of the
 * list. Otherwise the first message that applies, grey or red
 */
export type Preview =
  | {
      readonly ok: true
      readonly total: number
      readonly strategy: Strategy
      /** Every chosen person, with what they get */
      readonly shares: readonly Share[]
      /** Who gets at least one: what the confirmation sends */
      readonly receivers: readonly Share[]
      readonly summary: string
    }
  | {
      readonly ok: false
      readonly summary: string
      readonly tone: "muted" | "error"
    }

/** «Scrivi un numero da 1 a <max>» (AC13) */
export const countError = (max: number) =>
  `Scrivi un numero da 1 a ${formatNumber(max)}`

/** «inattivo da 1 giorno», «inattivo da 12 giorni» (AC12, AC36) */
export const inactiveText = (days: number) =>
  `inattivo da ${plural(days, "giorno", "giorni")}`

const divide = (
  strategy: Strategy,
  total: number,
  chosen: readonly Member[]
): number[] => {
  const people = chosen.map((p) => ({ ...p, userId: userIdOf(p) }))
  switch (strategy) {
    case "pace":
      return splitByPace(
        total,
        people.map((p) => ({ ...p, pace: p.exactPace }))
      )
    case "level":
      return levelUp(total, people)
    case "equal":
      return splitEqually(total, people)
  }
}

const range = (values: readonly number[]) => ({
  low: Math.min(...values),
  high: Math.max(...values),
})

/** The summary of a valid preview (AC14) */
function validSummary(
  chosen: readonly Member[],
  shares: readonly number[]
): string {
  const got = chosen
    .map((person, index) => ({ person, count: shares[index] ?? 0 }))
    .filter((share) => share.count > 0)
  const left =
    got.length < chosen.length
      ? `Ricevono ${formatNumber(got.length)} dei ${formatNumber(chosen.length)} scelti. `
      : ""
  const each = range(got.map((share) => share.count))
  const head =
    got.length === 1
      ? formatNumber(each.low)
      : each.low === each.high
        ? `${formatNumber(each.low)} a testa`
        : `Da ${formatNumber(each.low)} a ${formatNumber(each.high)} a testa`
  const after = range(got.map((share) => share.person.active + share.count))
  const tail =
    after.low === after.high
      ? `${formatNumber(after.low)} da fare`
      : `tra ${formatNumber(after.low)} e ${formatNumber(after.high)} da fare`
  return `${left}${head} · dopo, ${tail}`
}

/**
 * The preview of the step (AC11, AC13, AC14):
 * - `count` is what «Quanti» reads, `null` without the field (the whole `max`);
 * - `per` with `touched` false: the step opened from a row of the team and no
 *   field changed yet, so «Quanti» asks for the number in grey
 */
export function previewOf({
  groups,
  chosen,
  strategy,
  max,
  count,
  per,
  touched,
  messages,
}: {
  groups: readonly Group[]
  chosen: readonly number[]
  strategy: Strategy
  max: number
  count: CountResult | null
  per?: number | undefined
  touched: boolean
  messages: Messages
}): Preview {
  const people = groups
    .flatMap((group) => group.people)
    .filter((person) => chosen.includes(person.operatorId))
  if (max <= 0)
    return {
      ok: false,
      tone: "muted",
      summary:
        messages === "assign"
          ? "Nessun cliente della Wave senza operatore"
          : "Niente da spostare: chi hai scelto non ha più contatti di questo tipo",
    }
  if (people.length === 0)
    return { ok: false, tone: "error", summary: "Scegli almeno un operatore" }
  const asked = people.find((person) => person.operatorId === per)
  if (asked !== undefined && !touched) {
    const name = firstName(asked)
    const inactive =
      asked.inactiveDays === null
        ? ""
        : `${name} è ${inactiveText(asked.inactiveDays)}. `
    return {
      ok: false,
      tone: "muted",
      summary: `${inactive}Quanti contatti a ${name}? Al massimo ${formatNumber(max)}.`,
    }
  }
  const total = count === null ? max : count.ok ? count.value : null
  if (total === null)
    return { ok: false, tone: "error", summary: countError(max) }
  const parts = divide(strategy, total, people)
  const shares = people.map((person, index) => ({
    operatorId: person.operatorId,
    count: parts[index] ?? 0,
  }))
  return {
    ok: true,
    total,
    strategy,
    shares,
    receivers: shares.filter((share) => share.count > 0),
    summary: validSummary(people, parts),
  }
}

/**
 * The button of the step (AC15): «Assegna <N> a <K> operatori» with K who
 * receives, or the verb alone when the preview isn't valid
 */
export const actionLabel = (preview: Preview, verb: string) =>
  preview.ok
    ? `${verb} ${formatNumber(preview.total)} a ${operatorsText(preview.receivers.length)}`
    : verb

/**
 * «Al giorno» (AC12): the to-do in the Wave after the assignment over the
 * working days left, rounded up; null for «—» (no deadline, no working days
 * left, nothing to do)
 */
export function perDay(todo: number, workdays: number | null): number | null {
  if (workdays === null || workdays <= 0 || todo <= 0) return null
  return Math.ceil(todo / workdays)
}
