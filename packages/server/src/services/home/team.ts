import { Effect } from "effect"
import { romeDayBounds } from "@mito/domain/contact/time"
import { callStats } from "../export/callStats"

/** The calls of a person of the team today */
export type TeamCalls = {
  readonly operatorId: number
  readonly calls: number
  readonly answered: number
  readonly appointments: number
}

/**
 * The calls today in Rome of the people `ids`, one row for each person who
 * made any (spec home-admin, D5): the rows of `callStats` of the day, the
 * ones the export and the analysis page count, kept for the people `ids`. One
 * function for «Chiamate oggi» and «Dettaglio giornaliero», so they all count
 * the same calls of the same people (AC7)
 */
export const teamCallsToday = Effect.fn("home.teamCallsToday")(function* (
  ids: ReadonlyArray<number>,
  now: Date
) {
  const { rows } = yield* callStats(romeDayBounds(now))
  const team = new Set(ids)
  return rows
    .filter(({ operatorId }) => team.has(operatorId))
    .map(({ operatorId, calls, answered, appointments }): TeamCalls => ({
      operatorId,
      calls,
      answered,
      appointments,
    }))
})
