import { Effect } from "effect"
import { and, asc, desc, eq, exists, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import type { DayRange } from "@mito/domain/analytics/window"
import type { Actor } from "@mito/domain/contact/permissions"
import { periodBounds } from "@mito/domain/export/period"
import { query } from "../../effect/db"
import { castAsNumber, romeDayOf } from "../../shared/sql"
import { financed, inComparison } from "./financed"
import { withComparison, type AnalysisRange } from "./range"

/** The Rome calendar day a practice was settled on, as `YYYY-MM-DD` (A1) */
const settledDay = romeDayOf(practices.dataLiquidazione)

/** The amount financed, summed (`0` for no practice) as a JS number. */
const amountFinanced = sql<number>`coalesce(sum(${castAsNumber(practices.importoFinanziato)}), 0)::float8`

/** How many practices, as a JS number. */
const practiceCount = sql<number>`count(*)::int`

/**
 * The financed practices settled in `range`, from Rome midnight of its first
 * day up to the Rome midnight after its last one (excluded). The series and the
 * branch totals read the same set (AC5).
 */
const financedBetween = (range: DayRange) =>
  and(financed(), inComparison(periodBounds(range)))

/**
 * The practices and the amount financed on each Rome day of `range`: only the
 * days with at least one financed practice, by day (D4). The admin counts
 * every financed practice, with or without customers (D9); an operator those
 * with at least one customer assigned to them, each practice once however
 * many of their customers hold it.
 */
const seriesOf = Effect.fnUntraced(function* (range: DayRange, actor: Actor) {
  const rows = yield* query((client) =>
    client
      .select({
        day: settledDay,
        practices: practiceCount,
        amount: amountFinanced,
      })
      .from(practices)
      .where(
        and(
          financedBetween(range),
          actor.role === "ADMIN"
            ? undefined
            : exists(
                client
                  .select({ one: sql`1` })
                  .from(customerToPratica)
                  .innerJoin(
                    customers,
                    eq(customers.id, customerToPratica.customerId)
                  )
                  .where(
                    and(
                      eq(customerToPratica.praticaId, practices.praticaId),
                      eq(customers.operatorId, actor.operatorId)
                    )
                  )
              )
        )
      )
      .groupBy(settledDay)
      .orderBy(asc(settledDay))
  )

  return rows.map((row) => ({
    day: row.day,
    practices: Number(row.practices),
    amount: Number(row.amount),
  }))
})

/**
 * The financed series of the window and of its comparison (`[]` with no
 * comparison), with the two ranges, one query for each.
 */
export const financedSeries = Effect.fn("analytics.financedSeries")(function* ({
  window,
  comparison,
  actor,
}: AnalysisRange & { actor: Actor }) {
  const [days, comparisonDays] = yield* withComparison(
    { window, comparison },
    [],
    (range) => seriesOf(range, actor)
  )
  return { window, comparison, days, comparisonDays }
})

/**
 * The practices and the amount financed by each point of sale in `range`, the
 * practices without one in the `null` row, by amount (largest first), then by
 * point of sale with the `null` row last. Every financed practice counts, with
 * or without customers, as the admin's series does (AC5).
 */
const branchRowsOf = Effect.fnUntraced(function* (range: DayRange) {
  const rows = yield* query((client) =>
    client
      .select({
        branch: practices.desPuntoVendita,
        practices: practiceCount,
        amount: amountFinanced,
      })
      .from(practices)
      .where(financedBetween(range))
      .groupBy(practices.desPuntoVendita)
      .orderBy(
        desc(amountFinanced),
        sql`${practices.desPuntoVendita} asc nulls last`
      )
  )

  return rows.map((row) => ({
    branch: row.branch,
    practices: Number(row.practices),
    amount: Number(row.amount),
  }))
})

/**
 * The financed amount by point of sale in the window (AC4: every point of sale
 * is a row, the practices without one in the `null` row), and the total
 * financed in the comparison, `null` with no comparison (AC5).
 */
export const branchTotals = Effect.fn("analytics.branchTotals")(function* ({
  window,
  comparison,
}: AnalysisRange) {
  const [rows, comparisonRows] = yield* withComparison(
    { window, comparison },
    null,
    branchRowsOf
  )
  return {
    window,
    comparison,
    rows,
    comparisonTotal:
      comparisonRows === null
        ? null
        : comparisonRows.reduce((total, row) => total + row.amount, 0),
  }
})
