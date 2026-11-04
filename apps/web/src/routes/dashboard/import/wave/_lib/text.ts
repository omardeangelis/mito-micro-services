import { format } from "date-fns"
import { it } from "date-fns/locale"
import { daysSince, romeToday, type Day } from "@mito/domain/wave/days"

// How the page of a Wave writes numbers, days and plurals (AC36)

/** «2.854», «12.000»: the dot of thousands from 4 digits, as the prototype */
export const formatNumber = (value: number) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

/** The day `YYYY-MM-DD` as the date at its midnight, where the calendar works */
export function dateOf(day: Day): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

const two = (value: number) => String(value).padStart(2, "0")

/** The day `YYYY-MM-DD` of a date of the calendar */
export const dayOf = (date: Date): Day =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`

/** «gio 3 dic» */
export const dayText = (day: Day) =>
  format(dateOf(day), "EEE d MMM", { locale: it })

/** «3/12», the day and the month (g/m) */
export const shortDay = (day: Day) => format(dateOf(day), "d/M")

/** `<N> <one>` or `<N> <many>`, with the number written as the page writes it */
export const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`

/** «1 cliente», «2.854 clienti» */
export const customersText = (count: number) =>
  plural(count, "cliente", "clienti")

/** «1 contatto», «12 contatti» */
export const contactsText = (count: number) =>
  plural(count, "contatto", "contatti")

/** «1 operatore», «3 operatori» */
export const operatorsText = (count: number) =>
  plural(count, "operatore", "operatori")

/** «1 scelto», «3 scelti» */
export const chosenText = (count: number) => plural(count, "scelto", "scelti")

/** «1 giorno lavorativo», «21 giorni lavorativi» */
export const workdaysText = (count: number) =>
  plural(count, "giorno lavorativo", "giorni lavorativi")

/** «1 da assegnare», «4 da assegnare» */
export const toAssignText = (count: number) =>
  `${formatNumber(count)} da assegnare`

/** «1 non spostato», «3 non spostati» */
export const notMovedText = (count: number) =>
  plural(count, "non spostato", "non spostati")

/** «Assegnato 1 cliente», «Assegnati 342 clienti» */
export const assignedText = (count: number) =>
  `${count === 1 ? "Assegnato" : "Assegnati"} ${customersText(count)}`

/** «Spostato 1 contatto», «Spostati 12 contatti» */
export const movedText = (count: number) =>
  `${count === 1 ? "Spostato" : "Spostati"} ${contactsText(count)}`

/** When the Wave was imported, from today in Rome: «oggi», «ieri», «3 giorni fa» */
export function importedWhen(importedAt: Date, today: Day) {
  const days = daysSince(romeToday(importedAt), today)
  if (days <= 0) return "oggi"
  if (days === 1) return "ieri"
  return `${formatNumber(days)} giorni fa`
}

/** «Carla», «Carla e Dario», «Ada, Carla e Dario» */
export function andText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`
}

/**
 * The «<nomi propri>» of a text (Definizioni): the first name of each, name
 * and surname for who shares the first name with another name of the text
 */
export function properNames(names: readonly string[]): string {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name
  return andText(
    names.map((name) =>
      names.some(
        (other) =>
          other !== name &&
          first(other).toLocaleLowerCase("it") ===
            first(name).toLocaleLowerCase("it")
      )
        ? name.trim()
        : first(name)
    )
  )
}
