import { Effect } from "effect"
import {
  and,
  avg,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  sql,
  sum,
  type SQL,
} from "drizzle-orm"
import { practices, type stateEnum } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import type { Actor } from "@mito/domain/contact/permissions"
import type { TimeFrame } from "@mito/domain/constants/timeframes"
import { query } from "../../effect/db"
import { castAsNumber } from "../../shared/sql"
import { financeWindows, type FinanceWindow } from "./windows"

/** The financed states: a rejected, renounced or reversed practice isn't. */
const FINANCED_STATES = [
  "Liquidata",
  "Chiusa",
  "Estinta anticipata",
] as const satisfies readonly (typeof stateEnum)[number][]

/**
 * The customers whose practices the caller sees: their own for an operator,
 * those with an operator for an admin.
 */
const customerAccess = (actor: Actor) =>
  actor.role === "ADMIN"
    ? isNotNull(customers.operatorId)
    : eq(customers.operatorId, actor.operatorId)

/** Practices settled in the reference window, both ends included. */
const inReference = ({ start, end }: FinanceWindow) =>
  and(
    gte(practices.dataLiquidazione, start),
    lte(practices.dataLiquidazione, end)
  )

/**
 * Practices settled in the comparison window, `end` excluded: it is the start
 * of the reference window, so a practice falls in one window only.
 */
const inComparison = ({ start, end }: FinanceWindow) =>
  and(
    gte(practices.dataLiquidazione, start),
    lt(practices.dataLiquidazione, end)
  )

/** Financed practices: in one of `FINANCED_STATES`. */
const financed = () => inArray(practices.state, [...FINANCED_STATES])

/**
 * The `aggregate` (`sum` or `avg`) of the amount financed by the financed
 * practices that match `period` and have at least one customer `actor` sees,
 * each practice counted once however many of its customers match. `0` when no
 * practice matches.
 */
const financedIn = (
  aggregate: typeof sum | typeof avg,
  actor: Actor,
  period: SQL | undefined
) =>
  Effect.gen(function* () {
    const rows = yield* query((client) =>
      client
        .select({
          importoFinanziato: aggregate(
            castAsNumber(practices.importoFinanziato)
          ),
        })
        .from(practices)
        .where(
          and(
            financed(),
            period,
            exists(
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
                    customerAccess(actor)
                  )
                )
            )
          )
        )
    )

    return Number(rows[0]?.importoFinanziato ?? 0)
  })

/**
 * The `aggregate` of the amount financed in the reference and in the
 * comparison window of `timeFrame` (`financeWindows`), counted by `financedIn`,
 * with the windows themselves.
 */
const financedOverWindows =
  (aggregate: typeof sum | typeof avg) =>
  ({ timeFrame, actor }: { timeFrame: TimeFrame; actor: Actor }) =>
    Effect.gen(function* () {
      const windows = yield* financeWindows(timeFrame)
      const [reference, comparison] = yield* Effect.all(
        [
          financedIn(aggregate, actor, inReference(windows.reference)),
          financedIn(aggregate, actor, inComparison(windows.comparison)),
        ],
        { concurrency: "unbounded" }
      )
      return { reference, comparison, windows }
    })

/** The amount financed in the time frame and in the one before it, summed. */
export const financedTotal = financedOverWindows(sum)

/**
 * The amount financed in the time frame and in the one before it, averaged per
 * practice.
 */
export const financedAverage = financedOverWindows(avg)

/**
 * The amount financed in the time frame (the `reference` window, both ends
 * included, from the server's clock at each call) by the financed practices
 * (`FINANCED_STATES`), for each point of sale (`null` for the practices
 * without one), ordered by point of sale. It counts every practice once, with
 * or without customers: it doesn't depend on who calls.
 */
export const financedByBranch = ({ timeFrame }: { timeFrame: TimeFrame }) =>
  Effect.gen(function* () {
    const { reference } = yield* financeWindows(timeFrame)
    const rows = yield* query((client) =>
      client
        .select({
          data: practices.desPuntoVendita,
          total: sum(castAsNumber(practices.importoFinanziato)),
        })
        .from(practices)
        .where(and(inReference(reference), financed()))
        .groupBy(practices.desPuntoVendita)
        .orderBy(practices.desPuntoVendita)
    )

    return rows.map((r) => ({ data: r.data, total: Number(r.total) }))
  })
