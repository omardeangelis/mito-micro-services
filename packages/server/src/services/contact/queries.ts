import { Effect } from "effect"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { alert, task } from "@mito/db/schema/task"
import { type Db, type DbClient, type DbError, query } from "../../effect/db"
import { customerAlerts } from "./customerAlerts"

/**
 * The active task of a customer: the most recently touched one among those
 * with `isActive = true`, or no row when there is none.
 */
export const getActiveTask = (customerId: string) =>
  query((client) =>
    // NB: un cliente può avere più task con isActive=true (bug noto sui duplicati).
    // Ordiniamo in modo deterministico e prendiamo SOLO la più recente, così tutti i
    // componenti che leggono la "task attiva" mostrano la stessa riga e non pescano
    // un [0] casuale. GREATEST(updatedAt, createdAt) = ultima volta che la riga è stata
    // toccata: è robusto anche rispetto al default congelato di updatedAt (le righe
    // realmente modificate hanno una data reale, quelle auto-create no).
    client
      .select()
      .from(task)
      .where(and(eq(task.isActive, true), eq(task.customerId, customerId)))
      .orderBy(
        desc(sql`GREATEST(${task.updatedAt}, ${task.createdAt})`),
        desc(task.id)
      )
      .limit(1)
  )

const activeAlertsOf = (client: DbClient, customerIds: string[]) =>
  client
    .select({
      customerId: task.customerId,
      name: customers.name,
      surname: customers.surname,
      alertId: alert.id,
      deadline: alert.deadline,
      message: alert.message,
      state: task.state,
    })
    .from(alert)
    .innerJoin(task, eq(task.alertId, alert.id))
    .innerJoin(customers, eq(customers.id, task.customerId))
    .where(
      and(
        inArray(task.customerId, customerIds),
        eq(alert.isResolved, false),
        eq(task.isActive, true)
      )
    )
    .orderBy(alert.deadline, alert.id)

type ActiveAlertRow = Awaited<ReturnType<typeof activeAlertsOf>>[number]

/**
 * Of the given customers, only those with an open alert (a planned callback
 * not yet resolved) on their active task, one row per such alert, by
 * deadline. An empty list yields no rows, without a query.
 */
export const listCustomersWithActiveAlerts = (
  customerIds: string[]
): Effect.Effect<ActiveAlertRow[], DbError, Db> =>
  customerIds.length === 0
    ? Effect.succeed([])
    : query((client) => activeAlertsOf(client, customerIds))

/**
 * The full Storico of a customer, open and closed alerts of all its tasks:
 * see `customerAlerts`.
 */
export const listCustomerAlerts = (customerId: string) =>
  query((client) => customerAlerts(client, customerId))
