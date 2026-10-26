import { Effect } from "effect"
import { and, avg, between, count, eq, sum } from "drizzle-orm"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import type { Actor } from "@mito/domain/contact/permissions"
import {
  TIMEFRAMEDELTA,
  TIMEFRAMEMAP,
  type TimeFrame,
} from "@mito/domain/constants/timeframes"
import { query } from "../../effect/db"
import { castAsNumber } from "../../shared/sql"

/**
 * The customers the caller sees: all for an admin, only their own for an
 * operator. Without a caller there is no filter.
 */
const customerAccess = (actor: Actor | undefined) =>
  actor && actor.role !== "ADMIN"
    ? eq(customers.operatorId, actor.operatorId)
    : undefined

/**
 * The amount financed in the time frame (`reference`) and in the one before it
 * (`comparison`), summed over the practices of customers who have an operator.
 * An operator sees only their own customers.
 */
export const financedTotal = ({
  timeFrame,
  actor,
}: {
  timeFrame: TimeFrame
  actor: Actor
}) =>
  Effect.gen(function* () {
    const accessCondition = customerAccess(actor)

    const assignedReference = yield* query((client) =>
      client
        .select({
          importoFinanziato: sum(castAsNumber(practices.importoFinanziato)),
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .innerJoin(operators, eq(operators.id, customers.operatorId))
        .where(
          and(
            accessCondition,
            between(
              practices.dataLiquidazione,
              TIMEFRAMEMAP[timeFrame].start,
              TIMEFRAMEMAP[timeFrame].end
            )
          )
        )
    )

    const assignedComparison = yield* query((client) =>
      client
        .select({
          importoFinanziato: sum(castAsNumber(practices.importoFinanziato)),
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .innerJoin(operators, eq(operators.id, customers.operatorId))
        .where(
          and(
            accessCondition,
            between(
              practices.dataLiquidazione,
              TIMEFRAMEDELTA[timeFrame].start,
              TIMEFRAMEDELTA[timeFrame].end
            )
          )
        )
    )

    return {
      reference: assignedReference[0]?.importoFinanziato ?? 0,
      comparison: assignedComparison[0]?.importoFinanziato ?? 0,
    }
  })

/**
 * The average amount financed in the time frame (`reference`) and in the one
 * before it (`comparison`), over the practices of customers who have an
 * operator. With an operator `actor` only their own customers count; with an
 * admin, or without `actor`, all of them.
 */
export const financedAverage = ({
  timeFrame,
  actor,
}: {
  timeFrame: TimeFrame
  actor?: Actor
}) =>
  Effect.gen(function* () {
    const accessCondition = customerAccess(actor)

    const assignedReference = yield* query((client) =>
      client
        .select({
          importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .innerJoin(operators, eq(operators.id, customers.operatorId))
        .where(
          and(
            accessCondition,
            between(
              practices.dataLiquidazione,
              TIMEFRAMEMAP[timeFrame].start,
              TIMEFRAMEMAP[timeFrame].end
            )
          )
        )
    )

    const assignedComparison = yield* query((client) =>
      client
        .select({
          importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .innerJoin(operators, eq(operators.id, customers.operatorId))
        .where(
          and(
            accessCondition,
            between(
              practices.dataLiquidazione,
              TIMEFRAMEDELTA[timeFrame].start,
              TIMEFRAMEDELTA[timeFrame].end
            )
          )
        )
    )

    return {
      reference: assignedReference[0]?.importoFinanziato ?? 0,
      comparison: assignedComparison[0]?.importoFinanziato ?? 0,
    }
  })

/**
 * The amount financed in the time frame, for each point of sale, ordered by
 * point of sale.
 */
export const financedByBranch = ({ timeFrame }: { timeFrame: TimeFrame }) =>
  Effect.gen(function* () {
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
        .where(
          between(
            practices.dataLiquidazione,
            TIMEFRAMEMAP[timeFrame].start,
            TIMEFRAMEMAP[timeFrame].end
          )
        )
    )

    return res.map((r) => ({
      data: r.sede,
      total: Number(r.total),
    })) as { data: string; total: number }[]
  })
