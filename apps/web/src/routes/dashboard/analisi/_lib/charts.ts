import type { Role } from "@mito/contract/schemas"

/** The charts of the Analysis page, in the order they are shown (AC3). */
const CHART_IDS = [
  "financed",
  "average",
  "branches",
  "progress",
  "calls",
  "appointments",
] as const

export type ChartId = (typeof CHART_IDS)[number]

/** The charts a role can see: the branches comparison is for the admin only (AC3). */
export function chartsFor(role: Role): ChartId[] {
  return role === "ADMIN"
    ? [...CHART_IDS]
    : CHART_IDS.filter((chart) => chart !== "branches")
}
