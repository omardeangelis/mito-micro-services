import {
  type LatestWave,
  type LatestWavePerson,
  type LatestWaves,
} from "@mito/contract/home"
import { type Day } from "@mito/domain/wave/days"
import { byName } from "@mito/domain/wave/split"
import {
  customersText,
  formatNumber,
  importedWhen,
  operatorsText,
  plural,
  shortDay,
} from "../../import/wave/_lib/text"
import { type Tone } from "./tone"

// The texts of «Ultimi import» (spec home-admin, AC9, AC10, AC31)

/**
 * The height of a person's row in the detail of a Wave, and of its title, in
 * rem. The skeleton of the section holds the place of the detail of the latest
 * Wave with 15 people (AC47); the detail draws its rows this tall
 */
export const DETAIL_ROW_REM = 2.5
export const DETAIL_TITLE_REM = 2.75
/**
 * The rows of the detail of the latest Wave in production, the reference of
 * AC47: 15 people in the two columns the detail has from 60rem
 */
export const DETAIL_SKELETON_ROWS = 8
/** The space under the rows of the detail, in rem */
export const DETAIL_BOTTOM_REM = 0.5

/** The summary beside the title (AC9) */
export function summaryText({
  unassignedDistinct,
  neverCalledDistinct,
}: Pick<LatestWaves, "unassignedDistinct" | "neverCalledDistinct">) {
  const unassigned =
    unassignedDistinct > 0
      ? `${customersText(unassignedDistinct)} senza operatore`
      : "Nessun cliente senza operatore"
  const never = plural(
    neverCalledDistinct,
    "contatto mai chiamato",
    "contatti mai chiamati"
  )
  return `${unassigned} · ${never}`
}

/** The people to call of a Wave: what an expired one still has to do */
const toCallOf = (wave: Pick<LatestWave, "people">) =>
  wave.people.reduce((sum, person) => sum + person.toCall, 0)

/** «importata oggi», «importata ieri», «importata 3 giorni fa» */
export const importedText = (
  wave: Pick<LatestWave, "importedAt">,
  today: Day
) => `importata ${importedWhen(wave.importedAt, today)}`

/**
 * What follows the age of the import under the name: the deadline, or what
 * is wrong with it (AC10). `tone` colors it, only in the two cases of trouble
 */
export function deadlineText(
  wave: Pick<LatestWave, "status" | "deadline" | "people">
): { text: string; tone: Tone } {
  if (wave.status === "unconfirmed")
    return { text: " · scadenza da confermare", tone: "warning" }
  if (wave.status === "expired")
    return {
      text: ` · scaduta · ${formatNumber(toCallOf(wave))} da fare`,
      tone: "danger",
    }
  return {
    text: wave.deadline ? ` · scade ${shortDay(wave.deadline)}` : "",
    tone: "muted",
  }
}

/** The percentage of the customers worked, rounded down: 1 of 3 is 33 */
export const workedPercent = (worked: number, customers: number) =>
  customers > 0 ? Math.floor((worked * 100) / customers) : 0

/** «1 lavorato», «12 lavorati» */
const workedText = (count: number) => plural(count, "lavorato", "lavorati")

/** «12 lavorati · 33%», or «Nessun cliente» with none (AC10) */
export const progressText = (wave: Pick<LatestWave, "customers" | "parts">) =>
  wave.customers === 0
    ? "Nessun cliente"
    : `${workedText(wave.parts.worked)} · ${workedPercent(wave.parts.worked, wave.customers)}%`

/** The text of the indicator, for who can't see the bar (AC31) */
export const meterText = (wave: Pick<LatestWave, "customers" | "parts">) => {
  const { worked, calledNoOutcome, neverCalled, unassigned } = wave.parts
  const called = plural(
    calledNoOutcome,
    "chiamato senza esito",
    "chiamati senza esito"
  )
  return `${workedText(worked)}, ${called}, ${neverCalledText(neverCalled)}, ${formatNumber(unassigned)} senza operatore, su ${customersText(wave.customers)}`
}

// The detail of an import (AC12)

/**
 * The people of a Wave in the order of the detail (D12): the inactive first,
 * then the others; in each group who has more never called first, then by name
 */
export const sortPeople = (
  people: readonly LatestWavePerson[]
): LatestWavePerson[] =>
  [...people].sort(
    (a, b) =>
      Number(b.inactiveDays !== null) - Number(a.inactiveDays !== null) ||
      b.neverCalled - a.neverCalled ||
      byName(a, b)
  )

/** «Chi ha i contatti della NOV» */
export const detailTitleText = (name: string) =>
  `Chi ha i contatti della ${name}`

/** «· 1 operatore», «· 12 operatori» */
export const detailPeopleText = (count: number) => `· ${operatorsText(count)}`

/** The never called of the inactive people, or `null` when there are none */
export const detailInactiveText = (people: readonly LatestWavePerson[]) => {
  const never = people
    .filter((person) => person.inactiveDays !== null)
    .reduce((sum, person) => sum + person.neverCalled, 0)
  return never > 0 ? `· ${neverCalledText(never)} da chi è inattivo` : null
}

/** «12 da chiamare» */
export const toCallText = (count: number) =>
  `${formatNumber(count)} da chiamare`

/** «1 mai chiamato», «3 mai chiamati» */
export const neverCalledText = (count: number) =>
  plural(count, "mai chiamato", "mai chiamati")

/** The width of a person's bar in percent: the highest of the detail is full */
export const barPercent = (toCall: number, highest: number) =>
  highest > 0 ? Math.min(100, (toCall * 100) / highest) : 0

export const NO_PEOPLE_TEXT = "Nessuno ha ancora contatti di questa Wave."
