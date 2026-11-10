import {
  answerRateOrNull,
  appointmentRateOrNull,
} from "@mito/domain/export/calls"
import { type TeamDay } from "@mito/contract/home"
import { formatNumber, plural } from "../../import/wave/_lib/text"

// The texts of the four numbers of today (spec home-admin, AC6, AC34)

const percent = new Intl.NumberFormat("it-IT", {
  style: "percent",
  maximumFractionDigits: 1,
})

/** The totals the domain's rates read; `noAnswer` isn't used by the two rates */
const totals = (day: TeamDay) => ({
  ...day,
  noAnswer: day.calls - day.answered,
})

/** A fraction as an Italian percentage with at most one decimal: «33,3%», «50%» */
export const percentText = (fraction: number) => percent.format(fraction)

/** «10 · 2 su 23 hanno chiamato», «Nessuna chiamata ancora» without calls */
export function callsText(day: TeamDay) {
  if (day.calls === 0) return "Nessuna chiamata ancora"
  const verb = day.called === 1 ? "ha chiamato" : "hanno chiamato"
  return `${formatNumber(day.calls)} · ${formatNumber(day.called)} su ${formatNumber(day.members)} ${verb}`
}

/** «33,3% · 1 risposta»; no rate before the first call, so no «0%» */
export function answerRateText(day: TeamDay) {
  const rate = answerRateOrNull(totals(day))
  if (rate === null) return "Dopo le prime chiamate"
  return `${percentText(rate)} · ${plural(day.answered, "risposta", "risposte")}`
}

/** «50% · 1 appuntamento»; waits for the first call, then for the first answer */
export function appointmentRateText(day: TeamDay) {
  if (day.calls === 0) return "Dopo le prime chiamate"
  const rate = appointmentRateOrNull(totals(day))
  if (rate === null) return "Dopo le prime risposte"
  return `${percentText(rate)} · ${plural(day.appointments, "appuntamento", "appuntamenti")}`
}

/** The parts of «I tuoi richiami», each only when it isn't 0: «3 scaduti», «2 di oggi» */
export function callbacksParts(overdue: number, today: number) {
  return {
    overdue: overdue > 0 ? plural(overdue, "scaduto", "scaduti") : null,
    today: today > 0 ? `${formatNumber(today)} di oggi` : null,
  }
}
