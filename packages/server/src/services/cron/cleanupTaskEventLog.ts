import { Effect } from "effect"
import { lt } from "drizzle-orm"
import { subMonths } from "date-fns"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { LOG_RETENTION_MONTHS as RETENTION_MONTHS } from "@mito/domain/export/period"
import { type Db, type DbError, query } from "@mito/server/effect/db"

/**
 * The `cleanupTaskEventLog` cron: deletes the event log rows older than 25
 * months before `now`. Returns how many it deleted.
 */
export const cleanupTaskEventLog = Effect.fn("cron.cleanupTaskEventLog")(
  function* (now: Date): Effect.fn.Return<number, DbError, Db> {
    const cutoff = subMonths(now, RETENTION_MONTHS)

    const deleted = yield* query((client) =>
      client
        .delete(taskEventLog)
        .where(lt(taskEventLog.createdAt, cutoff))
        .returning({ id: taskEventLog.id })
    )
    return deleted.length
  }
)
