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
 * The amount financed in the time frame (`reference`) and in the one before it
 * (`comparison`), as numbers (`0` when no practice falls in the window): the
 * sum over the financed practices (`FINANCED_STATES`) with at least one
 * customer the caller sees, each practice once. An operator sees the practices
 * with at least one customer of theirs; an admin those with at least one
 * customer who has an operator. `windows` are the spans counted, taken from
 * the server's clock at each call: `reference` from now − N days to now, both
 * ends included; `comparison` from now − 2N days, included, to now − N days,
 * excluded.
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
 * before it (`comparison`), as numbers (`0` when no practice falls in the
 * window): the average over the financed practices (`FINANCED_STATES`) with at
 * least one customer the caller sees, each practice once. An operator sees the
 * practices with at least one customer of theirs; an admin those with at least
 * one customer who has an operator. `windows` are the spans counted, taken
 * from the server's clock at each call: `reference` from now − N days to now,
 * both ends included; `comparison` from now − 2N days, included, to now − N
 * days, excluded.
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
        .where(and(settledIn(reference), financed()))
        .groupBy(practices.desPuntoVendita)
        .orderBy(practices.desPuntoVendita)
    )

    return rows.map((r) => ({ data: r.data, total: Number(r.total) }))
  })
