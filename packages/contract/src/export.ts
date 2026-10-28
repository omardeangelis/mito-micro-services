import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { InvalidPeriod } from "./errors"
import { AdminOnly, Authenticated } from "./middleware"

/** The four totals of the calls export, as `CallTotals` of @mito/domain */
export const CallTotals = Schema.Struct({
  calls: Schema.Number,
  answered: Schema.Number,
  appointments: Schema.Number,
  noAnswer: Schema.Number,
})

/** The totals of one operator in the period */
export const OperatorCalls = Schema.Struct({
  ...CallTotals.fields,
  operatorId: Schema.Number,
  name: Schema.String,
  surname: Schema.String,
})

/** The calls export of a period: one row per operator with calls, and the totals */
export const CallStats = Schema.Struct({
  rows: Schema.Array(OperatorCalls),
  totals: CallTotals,
})
export type CallStats = typeof CallStats.Type

/**
 * The group `export` (3.5 of brain/chore/migrazione-frontend-react.md): the
 * procedures of the tRPC router `export`, each with its name (H8).
 *
 * | procedure | method and path          |
 * | --------- | ------------------------ |
 * | callStats | GET /export/call-stats   |
 */
export class ExportGroup extends HttpApiGroup.make("export")
  .add(
    HttpApiEndpoint.get("callStats", "/export/call-stats", {
      // Calendar days in Rome, `YYYY-MM-DD`, both included: the server checks
      // them against the days selectable now (`exportPeriodInput`)
      query: { from: Schema.String, to: Schema.String },
      success: CallStats,
      error: InvalidPeriod,
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
