import { romeWallClock } from "../../utils/romeClock"

/**
 * The name the import saves on customers and practices: dashes become
 * underscores and, when it doesn't start with 4 digits, `MMYY_` of the month
 * in Rome at `now` goes in front.
 */
export const parseFileName = (fileName: string, now: Date) => {
  const fileNameWithNoDash = fileName.replace(/-/g, "_")
  return addMMYYToFileName(fileNameWithNoDash, now)
}

const addMMYYToFileName = (fileName: string, now: Date) => {
  const fileNameFirst4Chars = fileName.slice(0, 4)
  const isNumber = !isNaN(Number(fileNameFirst4Chars))
  if (isNumber) {
    return fileName
  }
  const rome = romeWallClock(now.getTime())
  const mm = String(rome.month + 1).padStart(2, "0")
  const yy = rome.year.toString().slice(-2)
  return `${mm}${yy}_${fileName}`
}
