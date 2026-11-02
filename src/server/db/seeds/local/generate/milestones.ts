// The instant `calls_registry` of the local seed (esiti-richiami-stati AC28).
// The migration writes it with `now()`, but the seed empties every table, so
// it writes its own, fixed from D: the log rows before it are the old
// `state_change` calls, the `call` rows after it are the registry. Keeping it
// out of the database's state keeps the dataset pure, and `seed:local:verify`
// regenerates it.
import type { AppMilestoneRow, Day } from "../types"
import { createDayClock } from "./clock"

/**
 * Days before D of the instant `calls_registry`. Longer than any active
 * contact's life (created at most 45 days before D), so every call of an active
 * contact falls after it, as `call` rows.
 */
export const CALLS_REGISTRY_OFFSET = 60

export function generateMilestones(day: Day): AppMilestoneRow[] {
  return [
    {
      name: "calls_registry",
      at: createDayClock(day).noon(CALLS_REGISTRY_OFFSET),
    },
  ]
}
