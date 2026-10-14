import "server-only"
import { Effect } from "effect"
import { and, eq, inArray, not } from "drizzle-orm"
import { calculatePriority } from "@/lib/utils/priority"
import { practices } from "@/server/db/schema/pratiche"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { alert as alerts, task as tasks } from "@/server/db/schema/task"
import { type Db, type DbError, query, transaction } from "@/server/effect/db"

/** Ids in one UPDATE: well under the 65,535 parameters of a Postgres query. */
const IDS_PER_UPDATE = 5_000

/**
 * Recomputes the priority of the active contacts without a custom priority,
 * except the `chiamare` ones already at 120; with `taskId`, only that one.
 *
 * Writes one UPDATE per priority value (and per `IDS_PER_UPDATE` ids), all in
 * one transaction: a failure leaves every priority as it was. One UPDATE per
 * contact, as before, didn't fit the 60 s of the function in prod.
 */
export const refreshPriorities = (
  taskId?: number
): Effect.Effect<void, DbError, Db> =>
  Effect.gen(function* () {
    const contacts = yield* query((client) =>
      client
        .select({
          id: tasks.id,
          state: tasks.state,
          deadline: alerts.deadline,
          customerId: tasks.customerId,
          closedAt: tasks.closedAt,
          customPriority: tasks.customPriority,
        })
        .from(tasks)
        .leftJoin(alerts, eq(tasks.alertId, alerts.id))
        .where(
          and(
            taskId === undefined ? undefined : eq(tasks.id, taskId),
            not(and(eq(tasks.state, "chiamare"), eq(tasks.priority, 120))!),
            eq(tasks.customPriority, false),
            eq(tasks.isActive, true)
          )
        )
    )
    const [first] = contacts
    if (!first) return

    // As before: the latest liquidation date of the first contact's customer,
    // for every contact
    const liquidations = yield* query((client) =>
      client
        .select({ dataLiquidazione: practices.dataLiquidazione })
        .from(customerToPratica)
        .leftJoin(
          practices,
          eq(customerToPratica.praticaId, practices.praticaId)
        )
        .where(eq(customerToPratica.customerId, first.customerId!))
        .groupBy(customerToPratica.praticaId, practices.praticaId)
    )
    const dataLiquidazione =
      liquidations.sort((a, b) =>
        a.dataLiquidazione! > b.dataLiquidazione! ? -1 : 1
      )[0]?.dataLiquidazione ?? null

    const idsByPriority = new Map<number, number[]>()
    for (const contact of contacts) {
      const priority = calculatePriority({
        ...contact,
        customerId: first.customerId!,
        customPriority: first.customPriority!,
        dataLiquidazione,
      })
      const ids = idsByPriority.get(priority)
      if (ids) ids.push(contact.id)
      else idsByPriority.set(priority, [contact.id])
    }

    yield* transaction(
      Effect.forEach(
        [...idsByPriority].flatMap(([priority, ids]) =>
          Array.from(
            { length: Math.ceil(ids.length / IDS_PER_UPDATE) },
            (_, chunk) => ({
              priority,
              ids: ids.slice(
                chunk * IDS_PER_UPDATE,
                (chunk + 1) * IDS_PER_UPDATE
              ),
            })
          )
        ),
        ({ priority, ids }) =>
          query((client) =>
            client.update(tasks).set({ priority }).where(inArray(tasks.id, ids))
          ),
        { discard: true }
      )
    )
  })
