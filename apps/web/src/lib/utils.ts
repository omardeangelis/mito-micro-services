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
