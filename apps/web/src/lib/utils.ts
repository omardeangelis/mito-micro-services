import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The sizes, weights, radii and shadows of the theme (styles/globals.css):
// without them tailwind-merge reads text-xxs as a color, font-heading as a
// family and shadow-card as a shadow color, so it drops a class it should
// keep or keeps two classes of the same property
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["xxs", "title"],
      "font-weight": ["label", "heading"],
      radius: ["control", "card", "sheet", "nav", "check"],
      shadow: ["card", "pop", "sidebar-active"],
    },
  },
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
