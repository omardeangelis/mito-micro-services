import { type Tone } from "@/lib/tones"

// The colors of the charts are tokens of the theme (spec design-system-web,
// appendix B): the dot of a tone, or chart-1 for a single series. A color is a
// CSS value, so it goes in `style` (D11), never in an SVG attribute. Whole
// names, never composed: Tailwind finds the variables in the sources
const palette = {
  blue: "var(--color-tag-blue-dot)",
  indigo: "var(--color-tag-indigo-dot)",
  magenta: "var(--color-tag-magenta-dot)",
  orange: "var(--color-tag-orange-dot)",
  amber: "var(--color-tag-amber-dot)",
  teal: "var(--color-tag-teal-dot)",
  green: "var(--color-tag-green-dot)",
  red: "var(--color-tag-red-dot)",
  neutral: "var(--color-tag-neutral-dot)",
  "chart-1": "var(--color-chart-1)",
  "chart-1-soft": "var(--color-chart-1-soft)",
} satisfies Record<ChartColor, string>

export type ChartColor = Tone | "chart-1" | "chart-1-soft"

/** The token of a chart color; the neutral dot for an unknown name */
export const chartColor = (color: string): string =>
  Object.hasOwn(palette, color) ? palette[color as ChartColor] : palette.neutral
