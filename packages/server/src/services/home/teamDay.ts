import { Clock, Effect } from "effect"
import { type Db, type DbError } from "../../effect/db"
import { type CallsRegistryMissing } from "../export/callStats"
import { teamMembers } from "../import/wave/team"
import { teamCallsToday } from "./team"

/** The numbers of «Chiamate oggi» and of the two rates, as `TeamDay` of @mito/contract. */
export type TeamDay = {
  calls: number
  answered: number
  appointments: number
  called: number
  members: number
}

/**
 * The calls of the team today in Rome at the Clock's instant (spec home-admin,
 * AC6, AC7): what the people of `teamMembers` made, added up from
 * `teamCallsToday`, the rows of «Dettaglio giornaliero».
 */
export const getTeamDay = Effect.fn("home.getTeamDay")(
  function* (): Effect.fn.Return<TeamDay, CallsRegistryMissing | DbError, Db> {
    const now = new Date(yield* Clock.currentTimeMillis)
    const members = yield* teamMembers()
    const perPerson = yield* teamCallsToday(
      members.map(({ operatorId }) => operatorId),
      now
    )
    const sum = (read: (row: (typeof perPerson)[number]) => number) =>
      perPerson.reduce((total, row) => total + read(row), 0)
    return {
      calls: sum(({ calls }) => calls),
      answered: sum(({ answered }) => answered),
      appointments: sum(({ appointments }) => appointments),
      called: perPerson.length,
      members: members.length,
    }
  }
)
