import { romeDay, romeTime } from "@mito/domain/contact/time"
import { daysSince } from "@mito/domain/wave/days"
import { type LatestWave, type TeamMember } from "@mito/contract/home"
import { wavePageHref } from "../../import/_components/format"
import { formatNumber } from "../../import/wave/_lib/text"
import { byName } from "@mito/domain/wave/split"
import { neverCalledText } from "./waves"
import { type Tone } from "./tone"
import { percentText } from "./today"

// The order and the texts of «Dettaglio giornaliero» (spec home-admin, AC27,
// AC28, AC34). Pure on the `now` and `today` of the server (D11): the labels
// don't move on their own

export type TeamOrder = "arretrati" | "chiamate" | "nome"

/** From 60 minutes after the last call of today, «ferma da» */
const IDLE_MINUTES = 60
/** Under this many to call, a person is about to run out */
const LOW_TO_CALL = 300

const MS_PER_MINUTE = 60_000

type Compare = (a: TeamMember, b: TeamMember) => number

const compares: Record<TeamOrder, Compare> = {
  arretrati: (a, b) =>
    b.overdue.total - a.overdue.total ||
    (b.overdue.oldestDays ?? 0) - (a.overdue.oldestDays ?? 0) ||
    byName(a, b),
  chiamate: (a, b) => b.calls - a.calls || byName(a, b),
  nome: byName,
}

/** The members in `order`; the same order in the two groups (AC27) */
export const sortMembers = (
  members: readonly TeamMember[],
  order: TeamOrder
): TeamMember[] => [...members].sort(compares[order])

/** «3 su 15 hanno chiamato», «1 su 15 ha chiamato» of `members` (AC34) */
export function calledText(members: readonly TeamMember[]) {
  const called = members.filter((member) => member.calls > 0).length
  const verb = called === 1 ? "ha chiamato" : "hanno chiamato"
  return `${formatNumber(called)} su ${formatNumber(members.length)} ${verb}`
}

/** The summary of the title: «3 su 15 hanno chiamato · 2 con arretrati» */
export function teamSummaryText(members: readonly TeamMember[]) {
  const late = members.filter((member) => member.overdue.total > 0).length
  return late > 0
    ? `${calledText(members)} · ${formatNumber(late)} con arretrati`
    : calledText(members)
}

/** «1 h», «1 h 35 min», «2 h» */
const idleText = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export type LastCall = {
  text: string
  /** No tone: the text of the row */
  tone: Tone | null
  /** «ferma da <durata>», under a call of today */
  idle: string | null
}

/**
 * «Ultima chiamata». Whether a person is inactive comes from the server, which
 * counts the days worked; the N shown counts the Rome days since the last call
 */
export function lastCallText(
  member: Pick<TeamMember, "lastCallAt" | "inactiveDays">,
  now: Date,
  today: string
): LastCall {
  const { lastCallAt, inactiveDays } = member
  if (lastCallAt === null)
    return { text: "Nessuna oggi", tone: "muted", idle: null }
  const days = daysSince(romeDay(lastCallAt), today)
  if (days <= 0) {
    const minutes = Math.floor(
      (now.getTime() - lastCallAt.getTime()) / MS_PER_MINUTE
    )
    return {
      text: `alle ${romeTime(lastCallAt)}`,
      tone: null,
      idle: minutes >= IDLE_MINUTES ? `ferma da ${idleText(minutes)}` : null,
    }
  }
  if (days === 1) return { text: "Ieri", tone: "muted", idle: null }
  return inactiveDays === null
    ? { text: `${days} giorni fa`, tone: "muted", idle: null }
    : { text: `Inattivo da ${days} giorni`, tone: "warning", idle: null }
}

/** Under the number of «Arretrati»; «Nessuno» when there are none */
export function overdueText({
  total,
  oldestDays,
}: Pick<TeamMember["overdue"], "total" | "oldestDays">) {
  if (total === 0 || oldestDays === null) return "Nessuno"
  return oldestDays === 1
    ? "il più vecchio da ieri"
    : `il più vecchio da ${formatNumber(oldestDays)} giorni`
}

/** Under the number of «Da chiamare» */
export function toCallNote({
  toCall,
  neverCalled,
}: Pick<TeamMember, "toCall" | "neverCalled">): { text: string; tone: Tone } {
  if (toCall === 0) return { text: "Finiti", tone: "warning" }
  if (toCall < LOW_TO_CALL) return { text: "Quasi finiti", tone: "warning" }
  return {
    text: neverCalledText(neverCalled),
    tone: "muted",
  }
}

/** «Risposta»: the rate of today, «—» without calls */
export function rateText({
  calls,
  answered,
}: Pick<TeamMember, "calls" | "answered">) {
  return calls === 0 ? "—" : percentText(answered / calls)
}

/**
 * Where «Assegna» of a person goes (D15): the Wave with the most customers
 * without an operator, the most recent on a tie (`rows` starts from it), with
 * the person chosen. `null` when no listed import has any
 */
export function teamAssignHref(
  rows: readonly LatestWave[],
  operatorId: number
) {
  const wave = rows.reduce<LatestWave | null>(
    (best, row) =>
      row.parts.unassigned > (best?.parts.unassigned ?? 0) ? row : best,
    null
  )
  if (wave === null) return null
  const href = wavePageHref({
    id: wave.runId,
    format: "wave",
    status: "completed",
  })
  return href && `${href}?per=${operatorId}`
}
