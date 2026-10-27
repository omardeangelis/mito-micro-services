// The colors the charts of the dashboard use, with the values of Tremor 3:
// the Tailwind 3 palette in hex. Tailwind 4 has its colors in oklch, a shade
// apart; the charts keep the ones of today (R6). A color is "<name>-<shade>",
// or a bare name for its 500, as Tremor takes them
const palette = {
  "amber-600": "#d97706",
  "blue-500": "#3b82f6",
  "cyan-600": "#0891b2",
  "emerald-500": "#10b981",
  "emerald-600": "#059669",
  "gray-200": "#e5e7eb",
  "gray-500": "#6b7280",
  "green-500": "#22c55e",
  "orange-500": "#f97316",
  "orange-600": "#ea580c",
  "red-500": "#ef4444",
  "red-600": "#dc2626",
  "rose-500": "#f43f5e",
  "violet-500": "#8b5cf6",
  "yellow-500": "#eab308",
} as const

export type ChartColor = keyof typeof palette | ColorName

type ColorName = keyof typeof palette extends `${infer Name}-${string}`
  ? Name
  : never

/** The hex of a chart color; gray-500 for one outside the palette */
export const chartColor = (color: string): string => {
  const key = color.includes("-") ? color : `${color}-500`
  return key in palette
    ? palette[key as keyof typeof palette]
    : palette["gray-500"]
}
