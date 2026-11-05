import { stateLabel } from "@mito/domain/contact/status"
import { romeDay, romeDayBounds, romeTime } from "@mito/domain/contact/time"
import { type ClosingOutcome, type QueueClosure } from "./queue"

// Hours and days of the home are always those of Rome, wherever the browser
// is (D15)
const TIME_ZONE = "Europe/Rome"

const dayFormat = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
})

// `it-IT` alone doesn't group the numbers of 4 digits. The types of TypeScript
// still take a boolean only
const numberFormat = new Intl.NumberFormat("it-IT", {
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions)

/** The day of `date` in Rome: «Domenica 1 novembre» */
export const longDay = (date: Date) => {
  const day = dayFormat.format(date)
  return day.charAt(0).toUpperCase() + day.slice(1)
}

/** A day of the backend, `YYYY-MM-DD`: «01/11» */
export const dayMonth = (day: string) => {
  const [, month, date] = day.split("-")
  return `${date}/${month}`
}

/**
 * The last attempt of a row, by the days of Rome: «tentato alle 08:05» today,
 * «tentato ieri alle 08:05», «tentato 01/11» before
 */
export const triedText = (at: Date, now: Date) => {
  const day = romeDay(at)
  if (day === romeDay(now)) return `tentato alle ${romeTime(at)}`
  // A Rome day can last 23 or 25 hours: yesterday ends just before today starts
  const today = romeDayBounds(now).start
  if (day === romeDay(new Date(today.getTime() - 1)))
    return `tentato ieri alle ${romeTime(at)}`
  return `tentato ${dayMonth(day)}`
}

/** What a row closed by an outcome says: «Richiamo il 06/11 registrato alle 17:41» (AC23) */
export const registeredText = ({
  outcome,
  at,
  callbackDay,
}: Extract<QueueClosure, { kind: "registered" }>) => {
  const label =
    outcome === "richiamare" && callbackDay !== null
      ? `Richiamo il ${dayMonth(callbackDay)}`
      : stateLabel(outcome)
  return `${label} registrato alle ${romeTime(at)}`
}

/** The notice of a registered call: «Registrato: richiamo il 06/11 · Mario Rossi» (AC25) */
export const registeredNotice = (
  outcome: ClosingOutcome | "non risponde",
  callbackDay: string | null,
  customer: string
) => {
  const label =
    outcome === "richiamare" && callbackDay !== null
      ? `richiamo il ${dayMonth(callbackDay)}`
      : stateLabel(outcome)
  return `Registrato: ${label} · ${customer}`
}

/** A number with the dot of the thousands: «2.854» */
export const thousands = (value: number) => numberFormat.format(value)

/** «Buongiorno, Ada»: only the first word of the name; without one, «Buongiorno» */
export const greeting = (name: string | null | undefined) => {
  const first = name?.trim().split(/\s+/)[0]
  return first ? `Buongiorno, ${first}` : "Buongiorno"
}
