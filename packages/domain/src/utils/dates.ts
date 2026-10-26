import { romeLocalDate, romeWallClock } from "./romeClock"

const MS_PER_DAY = 24 * 60 * 60 * 1000

const monthMap: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

/**
 * A date of an import file, as a browser in Rome reads it (AC33): an Excel
 * serial (5 digits), `YYYYMMDD`, `M/D/YY(YY)` or `ddMMMyyyy`; otherwise null.
 * A two-digit year up to the current one (in Rome, at `now`) is this century.
 */
export function parseDateInput(dateInput: string, now: Date): Date | null {
  const currentYear = romeWallClock(now.getTime()).year
  const pivotYear = currentYear % 100
  const currentCentury = Math.floor(currentYear / 100) * 100

  if (/^\d{5}$/.test(dateInput)) {
    return formatDateSerialInDate(dateInput)
  }

  if (/^\d{8}$/.test(dateInput)) {
    return extractDataFromYYYYMMDD(dateInput)
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateInput)) {
    const [month, day, year] = dateInput.split("/").map(Number)
    if (year !== undefined && !isNaN(month!) && !isNaN(day!) && !isNaN(year)) {
      let fullYear
      if (year < 100) {
        if (year <= pivotYear) {
          fullYear = currentCentury + year
        } else {
          fullYear = currentCentury + year - 100
        }
      } else {
        fullYear = year
      }
      return romeLocalDate(fullYear, month! - 1, day)
    }
  }

  if (/^\d{1,2}[a-zA-Z]{3}\d{4}$/.test(dateInput)) {
    const day = parseInt(dateInput.slice(0, 2))
    const monthStr = dateInput.slice(2, 5)
    const year = parseInt(dateInput.slice(5, 9))
    const month = monthMap[monthStr]
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return romeLocalDate(year, month, day)
    }
  }

  return null
}

const extractDataFromYYYYMMDD = (date: string) => {
  const year = parseInt(date.toString().substring(0, 4), 10)
  const month = parseInt(date.toString().substring(4, 6), 10) - 1
  const day = parseInt(date.toString().substring(6, 8), 10)
  return romeLocalDate(year, month, day)
}

/**
 * Days after 1 January 1900 at midnight in Rome, counted from 1. Excel counts
 * a 29 February 1900 that didn't exist, so from March 1900 the date is one day
 * later than Excel's (OQ2), and in summer time at 01:00.
 */
export const formatDateSerialInDate = (serial: string) => {
  const excelBaseDate = romeLocalDate(1900, 0, 1)
  return new Date(excelBaseDate.getTime() + (Number(serial) - 1) * MS_PER_DAY)
}
