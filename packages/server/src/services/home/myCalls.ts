import { Clock, Effect } from "effect"
import { and, desc, eq, sql } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { romeDay, romeDayBounds } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { alert } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query } from "../../effect/db"
import {
  callResult,
  callsRegistryAt,
  type CallsRegistryMissing,
  isCallIn,
} from "../export/callStats"

/** A call of the actor, as `MyCall` of @mito/contract. */
export type MyCall = {
  id: number
  requestId: string | null
  taskId: number | null
  name: string | null
  surname: string | null
  phoneNumber: string | null
  outcome: TaskStatus | null
  at: Date
  origin: "alert" | "list" | null
  callbackDay: string | null
  message: string | null
}

/**
 * The calls the actor registered today in Rome, from any page, the newest
 * first (AC28), one row per call (AC31). The same definition of a call as the
 * export (`isCallIn`), so the old rows of the day of the release count too.
 * The `call` row of a Richiamare has its new alert in `alert_id`; for the other
 * outcomes that alert, if any, is not theirs (AC29).
 */
export const listMyCalls = Effect.fn("home.listMyCalls")(function* ({
  actor,
}: {
  actor: Actor
}): Effect.fn.Return<MyCall[], CallsRegistryMissing | DbError, Db> {
  const now = yield* Clock.currentTimeMillis
  const registryAt = yield* callsRegistryAt()
  const rows = yield* query((client) =>
    client
      .select({
        id: taskEventLog.id,
        requestId: taskEventLog.requestId,
        taskId: taskEventLog.taskId,
        name: customers.name,
        surname: customers.surname,
        phoneNumber: customers.phoneNumber,
        outcome: sql<TaskStatus | null>`${callResult}`,
        at: taskEventLog.createdAt,
        origin: taskEventLog.origin,
        deadline: alert.deadline,
        message: alert.message,
      })
      .from(taskEventLog)
      .innerJoin(customers, eq(customers.id, taskEventLog.customerId))
      .leftJoin(alert, eq(alert.id, taskEventLog.alertId))
      .where(
        and(
          eq(taskEventLog.actorOperatorId, actor.operatorId),
          isCallIn(romeDayBounds(new Date(now)), registryAt)
        )
      )
      .orderBy(desc(taskEventLog.createdAt), desc(taskEventLog.id))
  )

  return rows.map(({ deadline, message, ...call }) => {
    const callback = call.outcome === "richiamare" ? deadline : null
    return {
      ...call,
      callbackDay: callback === null ? null : romeDay(callback),
      message: callback === null ? null : message,
    }
  })
})
