export { DAYS_PER_RATE } from "@/lib/constants/practice"

export const dateWithoutTimeZone = (date: Date | undefined | string) => {
  if (!date) return undefined
  const dateObj = typeof date === `string` ? new Date(date) : date
  dateObj.setTime(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
  return dateObj
}
