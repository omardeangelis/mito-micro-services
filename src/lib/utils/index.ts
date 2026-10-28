import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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

/** The array in slices of `size`, in order. */
export function splitArray<T>(array: T[], size: number): T[][] {
  const res = [] as T[][]
  for (let i = 0; i < array.length; i += size) {
    res.push(array.slice(i, i + size))
  }
  return res
}

export { cleanObject } from "@mito/domain/utils/object"
export {
  formatDateAsDMHM,
  formatDateAsDMY,
  formatTime,
} from "@mito/client/format"
