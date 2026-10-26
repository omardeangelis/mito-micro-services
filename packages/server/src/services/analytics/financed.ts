import { Effect } from "effect"
import { and, avg, count, eq, gte, lt, lte, sum, type SQL } from "drizzle-orm"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import type { Actor } from "@mito/domain/contact/permissions"
import type { TimeFrame } from "@mito/domain/constants/timeframes"
import { query } from "../../effect/db"
import { castAsNumber } from "../../shared/sql"
import { financeWindows, type FinanceWindow } from "./windows"

/**
 * The customers the caller sees, among those with an operator: all of them for
 * an admin, only their own for an operator.
 */
const customerAccess = (actor: Actor) =>
  actor.role === "ADMIN"
    ? undefined
    : eq(customers.operatorId, actor.operatorId)

/** Practices settled in the window, both ends included. */
const settledIn = ({ start, end }: FinanceWindow) =>
  and(
    gte(practices.dataLiquidazione, start),
    lte(practices.dataLiquidazione, end)
  )

/** Practices settled in the window, `end` excluded. */
const settledBefore = ({ start, end }: FinanceWindow) =>
  and(
    gte(practices.dataLiquidazione, start),
    lt(practices.dataLiquidazione, end)
  )

/**
 * The `aggregate` (`sum` or `avg`) of the amount financed by the practices that
 * match `period`, over the practices of customers who have an operator that
 * `actor` sees. `0` when no practice matches.
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
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .innerJoin(operators, eq(operators.id, customers.operatorId))
        .where(and(customerAccess(actor), period))
    )

    return Number(rows[0]?.importoFinanziato ?? 0)
  })

/**
 * The amount financed in the time frame (`reference`) and in the one before it
 * (`comparison`), summed over the practices of customers who have an operator,
 * as numbers (`0` when no practice falls in the window). `windows` are the
 * spans counted, taken from the server's clock at each call: `reference` from
 * now − N days to now, both ends included; `comparison` from now − 2N days,
 * included, to now − N days, excluded. An operator sees only their own
 * customers.
 */
export const financedTotal = ({
  timeFrame,
  actor,
}: {
  timeFrame: TimeFrame
  actor: Actor
}) =>
  Effect.gen(function* () {
    const windows = yield* financeWindows(timeFrame)

    return {
      reference: yield* financedIn(sum, actor, settledIn(windows.reference)),
      comparison: yield* financedIn(
        sum,
        actor,
        settledBefore(windows.comparison)
      ),
      windows,
    }
  })

/**
 * The average amount financed in the time frame (`reference`) and in the one
 * before it (`comparison`), over the practices of customers who have an
 * operator, as numbers (`0` when no practice falls in the window). `windows`
 * are the spans counted, taken from the server's clock at each call:
 * `reference` from now − N days to now, both ends included; `comparison` from
 * now − 2N days, included, to now − N days, excluded. An operator sees only
 * their own customers; an admin all of them.
 */
export const financedAverage = ({
  timeFrame,
  actor,
}: {
  timeFrame: TimeFrame
  actor: Actor
}) =>
  Effect.gen(function* () {
    const windows = yield* financeWindows(timeFrame)

    return {
      reference: yield* financedIn(avg, actor, settledIn(windows.reference)),
      comparison: yield* financedIn(
        avg,
        actor,
        settledBefore(windows.comparison)
      ),
      windows,
    }
  })

/**
 * The amount financed in the time frame (the `reference` window, both ends
 * included, from the server's clock at each call), for each point of sale,
 * ordered by point of sale.
 */
export const financedByBranch = ({ timeFrame }: { timeFrame: TimeFrame }) =>
  Effect.gen(function* () {
    const { reference } = yield* financeWindows(timeFrame)
    const res = yield* query((client) =>
      client
        .selectDistinct({
          total: sum(castAsNumber(practices.importoFinanziato)),
          sede: practices.desPuntoVendita,
          count: count(),
        })
        .from(practices)
        .orderBy(practices.desPuntoVendita)
        .groupBy(practices.desPuntoVendita)
        .where(settledIn(reference))
    )

    return res.map((r) => ({
      data: r.sede,
      total: Number(r.total),
    })) as { data: string; total: number }[]
  })
