import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { type CustomerWrite, type Customer } from "../types/schemas"
import SparkMD5 from "spark-md5"

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

//Write an utils that takes a Date object and return a string in the format "dd/mm/yyyy"
export const formatDateAsDMY = (date: Date) => {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export function parseDateInput(dateInput: string): Date | null {
  // Ottieni l'anno corrente
  const currentYear = new Date().getFullYear()
  const pivotYear = currentYear % 100 // Le ultime due cifre dell'anno corrente
  const currentCentury = Math.floor(currentYear / 100) * 100

  // Controlla se è una data seriale di Excel
  if (/^\d{5}$/.test(dateInput)) {
    return formatDateSerialInDate(dateInput)
  }

  // Controlla se è una data in formato YYYYMMDD
  if (/^\d{8}$/.test(dateInput)) {
    return extractDataFromYYYYMMDD(dateInput)
  }

  // Controlla se è una data normale in formato M/D/YY, M/D/YYYY, MM/DD/YY, o MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateInput)) {
    const [month, day, year] = dateInput.split("/").map(Number)
    if (year !== undefined && !isNaN(month!) && !isNaN(day!) && !isNaN(year)) {
      // Gestisci il caso YY
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
      return new Date(fullYear, month! - 1, day)
    }
  }

  // Controlla se è una data in formato ddMMMMyyyy (es: 23Mar1959)
  if (/^\d{1,2}[a-zA-Z]{3}\d{4}$/.test(dateInput)) {
    const day = parseInt(dateInput.slice(0, 2))
    const monthStr = dateInput.slice(2, 5)
    const year = parseInt(dateInput.slice(5, 9))

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

    const month = monthMap[monthStr]
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day)
    }
  }

  // Se non corrisponde a nessuno dei formati specificati, restituisci null o un errore
  return null
}

const extractDataFromYYYYMMDD = (date: string) => {
  // Extract year, month, and day from the string
  const year = parseInt(date.toString().substring(0, 4), 10)
  const month = parseInt(date.toString().substring(4, 6), 10) - 1 // Months are zero-indexed in JavaScript
  const day = parseInt(date.toString().substring(6, 8), 10)

  // Create a new Date object
  return new Date(year, month, day)
}

const formatDateSerialInDate = (serial: string) => {
  const serialNumber = Number(serial)
  // La data di riferimento di Excel
  const excelBaseDate = new Date(1900, 0, 1) // 1 gennaio 1900
  // Aggiungi il numero di giorni al numero di riferimento
  const resultDate = new Date(
    excelBaseDate.getTime() + (serialNumber - 1) * 24 * 60 * 60 * 1000
  )
  return resultDate
}

export const getTimeDifferenceFromNowAsDD = (date: Date) => {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" })
  )
  const romeDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Rome" })
  )
  const diff = romeDate.getTime() - now.getTime()
  const diffInDays = diff / (1000 * 3600 * 24)
  const delta = Math.ceil(diffInDays)
  if (delta < 1) {
    return "Domani"
  }
  return `tra ${delta} giorni`
}

type HashForCustomer = Pick<Customer, "tempID" | "id">

function createHashFromString({ tempId, id }: { tempId?: string; id: string }) {
  return SparkMD5.hash(`${tempId}-${id}`)
}

export function createHashForCustomer(customer: HashForCustomer) {
  const input = {
    id: customer.id,
    tempId: customer.tempID,
  }
  return createHashFromString(input)
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

export function cleanObject<T extends Record<string, unknown>>(obj: T) {
  return Object.entries(obj)
    .filter(([_, v]) => v !== null && v !== undefined && v !== "")
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as T)
}
