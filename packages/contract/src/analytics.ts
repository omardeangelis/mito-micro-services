import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { AdminOnly, Authenticated } from "./middleware"

/**
 * `TIMEFRAMEOPTIONS` of @mito/domain/constants/timeframes, written again since
 * the contract imports only effect (H5)
 */
export const TimeFrame = Schema.Literals(["30d", "90d", "365d"])
export type TimeFrame = typeof TimeFrame.Type

/** The time frame of the cards: 30 days when the address has none */
const TimeFrameQuery = { timeFrame: Schema.optional(TimeFrame) }

/** A span of time, as `financeWindows` counts it */
const FinanceWindow = Schema.Struct({ start: Schema.Date, end: Schema.Date })

/**
 * The amount financed in the time frame (`reference`) and in the one before
 * it (`comparison`), with the two windows
 */
export const FinancedOverWindows = Schema.Struct({
  reference: Schema.Number,
  comparison: Schema.Number,
  windows: Schema.Struct({
    reference: FinanceWindow,
    comparison: FinanceWindow,
  }),
})
export type FinancedOverWindows = typeof FinancedOverWindows.Type

/** The amount financed by the practices of a point of sale (null: none) */
export const BranchTotal = Schema.Struct({
  data: Schema.NullOr(Schema.String),
  total: Schema.Number,
})
export type BranchTotal = typeof BranchTotal.Type

/**
 * The group `analytics` (3.5 of brain/chore/migrazione-frontend-react.md):
 * the procedures of the tRPC router `analytics`, each with its name (H8).
 *
 * | procedure           | method and path                      |
 * | ------------------- | ------------------------------------ |
 * | getFinancedTotal    | GET /analytics/financed-total        |
 * | getFinancedAverage  | GET /analytics/financed-average      |
 * | getFinancedByBranch | GET /analytics/financed-by-branch    |
 * | getContactProgress  | GET /analytics/contact-progress      |
 */
export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("getFinancedTotal", "/analytics/financed-total", {
      query: TimeFrameQuery,
      success: FinancedOverWindows,
    })
  )
  .add(
    HttpApiEndpoint.get("getFinancedAverage", "/analytics/financed-average", {
      query: TimeFrameQuery,
      success: FinancedOverWindows,
    })
  )
  .add(
    HttpApiEndpoint.get(
      "getFinancedByBranch",
      "/analytics/financed-by-branch",
      { query: TimeFrameQuery, success: Schema.Array(BranchTotal) }
    ).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("getContactProgress", "/analytics/contact-progress", {
      // The active contacts with an outcome, and those still to call
      success: Schema.Struct({ done: Schema.Number, todo: Schema.Number }),
    })
  )
  .middleware(Authenticated) {}
