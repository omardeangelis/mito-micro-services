import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { type CustomerWrite, type Customer } from "@mito/domain/schemas"
import { createHashForCustomer } from "@mito/domain/utils/customerHash"

// $ExpectType string

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isServer = typeof window === "undefined"

/**
 *
 * @param params_key The key of the url params
 * @returns The map of the url params and the url object
 */
export const getUrlParmsWithMultipleValue = (params: string) => {
  let defaultFilter: string[] = []

  if (params) {
    defaultFilter = params.split(",").map((p) => decodeURIComponent(p))
  }

  const parsed = defaultFilter.map((p) =>
    p.split("=").map((p) => p.replace("[", "").replace("]", ""))
  )

  const map = new Map(parsed as Iterable<[string, string]>)

  return {
    map,
  }
}

export const currencyFormatter = (value: number | string) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value))

// if minutes < 10 add a 0 before the minutes
// if hours < 10 add a 0 before the hours
export const formatTime = (date: Date) => {
  const minutes =
    date.getMinutes() < 10 ? `0${date.getMinutes()}` : date.getMinutes()
  const hours = date.getHours() < 10 ? `0${date.getHours()}` : date.getHours()

  return `${hours}:${minutes}`
}

//Write an utils that takes a Date object and return a string in the format "dd/mm - hh:mm"
// If is today return oggi - hh:mm
// If is yesterday return ieri - hh:mm
export const formatDateAsDMHM = (date: Date) => {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const isToday = today.toDateString() === date.toDateString()
  const isYesterday = yesterday.toDateString() === date.toDateString()

  if (isToday) {
    return `oggi - ${formatTime(date)}`
  }

  if (isYesterday) {
    return `ieri - ${formatTime(date)}`
  }

  return `${date.getDate()}/${date.getMonth() + 1} - ${formatTime(date)}`
}

// The Italian day, not the one of the process: a server in UTC (Vercel) and a
// browser in Rome must print the same text, or the page fails to hydrate
const italianDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "numeric",
  year: "numeric",
})

// "d/m/yyyy" (no padding) in the Italian day of the instant
export const formatDateAsDMY = (date: Date) => {
  if (Number.isNaN(date.getTime())) return ""
  const parts = italianDay.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value
  return `${part("day")}/${part("month")}/${part("year")}`
}

export function findCustomerByHash({
  customer,
  customerList,
}: {
  customer: Pick<CustomerWrite, "tempID">
  customerList: Customer[] | CustomerWrite[]
}) {
  return customerList.find((c) => {
    const input = {
      id: c.id!,
      tempID: customer.tempID,
    }
    return createHashForCustomer(input) === c.uniqueHash
  })
}

export { createHashForCustomer }
export { cleanObject } from "@mito/domain/utils/object"
