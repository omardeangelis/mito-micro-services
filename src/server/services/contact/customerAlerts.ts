import "server-only"
import { and, desc, eq } from "drizzle-orm"
import { operators } from "@/server/db/schema/operators"
import { alert, task } from "@/server/db/schema/task"
import { type DbClient } from "@/server/effect/db"

/**
 * The Storico of a customer: the alerts of all its contacts, past and
 * present, by descending deadline, each with the name of the operator who
 * closed it (null while open). `onlyClosed` leaves out the open ones.
 */
export const customerAlerts = (
  client: DbClient,
  customerId: string,
  { onlyClosed = false }: { onlyClosed?: boolean } = {}
) =>
  client
    .select({
      id: alert.id,
      deadline: alert.deadline,
      message: alert.message,
      isResolved: alert.isResolved,
      updatedAt: alert.updatedAt,
      resolvedByName: operators.name,
      resolvedBySurname: operators.surname,
    })
    .from(alert)
    .innerJoin(task, eq(task.id, alert.taskId))
    .leftJoin(operators, eq(operators.id, alert.resolvedBy))
    .where(
      and(
        eq(task.customerId, customerId),
        onlyClosed ? eq(alert.isResolved, true) : undefined
      )
    )
    .orderBy(desc(alert.deadline))
