import { type CellObject } from "xlsx"

/** A cell of a row given to `aoa_to_sheet`: a value, or a cell with its format. */
export type SheetValue = string | number | null | CellObject

const AMOUNT_FORMAT = "#,##0.00"
const DATE_FORMAT = "dd/mm/yyyy"
const DAY_MS = 24 * 60 * 60 * 1000
/** The day number Excel gives to 01/01/1970. */
const EPOCH_SERIAL = 25569
/** 01/03/1900. Excel counts a 29/02/1900 that never was: earlier days are off by one. */
const FIRST_SERIAL = 61

const italianDay = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/**
 * A decimal column as a number, so Excel can sort and add it up. Postgres
 * sends decimals as text: a value that isn't a number (some imported rows hold
 * NaN) stays as it is, a missing one stays empty.
 */
export const numberCell = (
  value: string | number | null | undefined,
  format?: string
): SheetValue => {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return format ? { t: "n", v: number, z: format } : number
}

/** `numberCell` shown with two decimals. */
export const amountCell = (value: string | number | null | undefined) =>
  numberCell(value, AMOUNT_FORMAT)

/**
 * A date column as an Excel date, on the day it has in Italy. The dates are
 * saved as midnight in Italy, the evening before in UTC: as JSON text they
 * show the day before.
 */
export const dateCell = (
  value: Date | string | null | undefined
): SheetValue => {
  if (!value) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)

  const parts = italianDay.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value)
  const year = part("year")
  const serial =
    Date.UTC(year, part("month") - 1, part("day")) / DAY_MS + EPOCH_SERIAL
  // Excel has no such date: as text
  if (year < 1900 || serial < FIRST_SERIAL) return italianDay.format(date)
  return { t: "n", v: serial, z: DATE_FORMAT }
}
