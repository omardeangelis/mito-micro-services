import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// text-xxs is a font size of the theme (styles/globals.css): without it
// tailwind-merge reads it as a color and drops the text color next to it
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["xxs"] } },
})

/** The class names of a component, with the later Tailwind classes winning */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The map of a parameter with several `[key]=value` pairs, as `filter_by`
 * (`[sede]=Roma-Milano,[operatore]=7`): each pair decoded, the brackets dropped
 */
export const getUrlParmsWithMultipleValue = (params: string | null) => {
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

/** The array in slices of `size`, in order. */
export function splitArray<T>(array: readonly T[], size: number): T[][] {
  const res = [] as T[][]
  for (let i = 0; i < array.length; i += size) {
    res.push(array.slice(i, i + size))
  }
  return res
}
