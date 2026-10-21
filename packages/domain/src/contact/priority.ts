/** The priority bands, from the lowest to the highest. */
export const priorityBands = ["low", "medium", "high", "urgent"] as const

export type PriorityBand = (typeof priorityBands)[number]

// Upper bound of each band; `urgent` has none (above 100).
const upperBound = { low: 20, medium: 60, high: 100 } as const

/**
 * Band of a priority (AC12): low up to 20, medium up to 60, high up to 100,
 * urgent above 100 (the cron's 150 included). Badge and filter share it.
 */
export const bandOf = (priority: number): PriorityBand => {
  if (priority <= upperBound.low) return "low"
  if (priority <= upperBound.medium) return "medium"
  if (priority <= upperBound.high) return "high"
  return "urgent"
}

/** The priority stored when a band is picked by hand: 20, 60, 100, 120. */
export const bandValue = (band: PriorityBand): number => {
  switch (band) {
    case "low":
      return 20
    case "medium":
      return 60
    case "high":
      return 100
    case "urgent":
      return 120
  }
}

/**
 * Inclusive bounds of a band for the filter; `null` means no bound. The
 * priority is an integer.
 */
export const bandRange = (
  band: PriorityBand
): { min: number | null; max: number | null } => {
  switch (band) {
    case "low":
      return { min: null, max: upperBound.low }
    case "medium":
      return { min: upperBound.low + 1, max: upperBound.medium }
    case "high":
      return { min: upperBound.medium + 1, max: upperBound.high }
    case "urgent":
      return { min: upperBound.high + 1, max: null }
  }
}
