import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { InvalidWindow } from "./errors"
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

/** A calendar day in Rome, `YYYY-MM-DD` */
const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))

/**
 * The `Compare` of @mito/domain/analytics/window written again, H5: the
 * period the window is compared with
 */
export const Compare = Schema.Literals(["previous", "last-year", "none"])
export type Compare = typeof Compare.Type

/** The query of the analysis page: the window of two days and its comparison */
export const AnalysisQuery = Schema.Struct({
  from: Day,
  to: Day,
  compare: Compare,
})
export type AnalysisQuery = typeof AnalysisQuery.Type

/** A span of two days in Rome, both included */
const DayRange = Schema.Struct({ from: Day, to: Day })

/** The fields every analysis answer shares: its window and its comparison */
const AnalysisWindow = {
  window: DayRange,
  comparison: Schema.NullOr(DayRange),
}

/** The practices and the amount financed on one day */
const FinancedDay = Schema.Struct({
  day: Day,
  practices: Schema.Number,
  amount: Schema.Number,
})

/** The financed series of the window and of its comparison, day by day */
export const FinancedSeries = Schema.Struct({
  ...AnalysisWindow,
  days: Schema.Array(FinancedDay),
  comparisonDays: Schema.Array(FinancedDay),
})
export type FinancedSeries = typeof FinancedSeries.Type

/** The practices and the amount financed by one point of sale (null: none) */
const BranchRow = Schema.Struct({
  branch: Schema.NullOr(Schema.String),
  practices: Schema.Number,
  amount: Schema.Number,
})

/** The totals of the financed amount by point of sale, with the comparison */
export const BranchTotals = Schema.Struct({
  ...AnalysisWindow,
  rows: Schema.Array(BranchRow),
  comparisonTotal: Schema.NullOr(Schema.Number),
})
export type BranchTotals = typeof BranchTotals.Type

/** The calls of one operator in the window */
const OperatorCallsRow = Schema.Struct({
  operatorId: Schema.Number,
  name: Schema.String,
  surname: Schema.String,
  calls: Schema.Number,
  answered: Schema.Number,
  noAnswer: Schema.Number,
  appointments: Schema.Number,
})

/** The calls by operator of the window, with the totals of the comparison */
export const CallsByOperator = Schema.Struct({
  ...AnalysisWindow,
  rows: Schema.Array(OperatorCallsRow),
  comparisonTotals: Schema.NullOr(
    Schema.Struct({
      calls: Schema.Number,
      answered: Schema.Number,
      appointments: Schema.Number,
    })
  ),
})
export type CallsByOperator = typeof CallsByOperator.Type

/** The calls of the operator on one day */
const CallDay = Schema.Struct({
  day: Day,
  calls: Schema.Number,
  answered: Schema.Number,
  noAnswer: Schema.Number,
  appointments: Schema.Number,
})

/** The calls of the signed-in operator in the window and in its comparison, day by day */
export const MyCallSeries = Schema.Struct({
  ...AnalysisWindow,
  days: Schema.Array(CallDay),
  comparisonDays: Schema.Array(CallDay),
})
export type MyCallSeries = typeof MyCallSeries.Type

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
 * | getFinancedSeries   | GET /analytics/financed-series       |
 * | getBranchTotals     | GET /analytics/branch-totals         |
 * | getCallsByOperator  | GET /analytics/calls-by-operator     |
 * | getMyCallSeries     | GET /analytics/my-call-series        |
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
  .add(
    HttpApiEndpoint.get("getFinancedSeries", "/analytics/financed-series", {
      query: AnalysisQuery.fields,
      success: FinancedSeries,
      error: InvalidWindow,
    })
  )
  .add(
    HttpApiEndpoint.get("getBranchTotals", "/analytics/branch-totals", {
      query: AnalysisQuery.fields,
      success: BranchTotals,
      error: InvalidWindow,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("getCallsByOperator", "/analytics/calls-by-operator", {
      query: AnalysisQuery.fields,
      success: CallsByOperator,
      error: InvalidWindow,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("getMyCallSeries", "/analytics/my-call-series", {
      query: AnalysisQuery.fields,
      success: MyCallSeries,
      error: InvalidWindow,
    })
  )
  .middleware(Authenticated) {}
