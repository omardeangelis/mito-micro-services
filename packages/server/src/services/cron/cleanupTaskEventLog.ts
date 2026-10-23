import { Effect } from "effect"
import { lt } from "drizzle-orm"
import { subMonths } from "date-fns"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { LOG_RETENTION_MONTHS as RETENTION_MONTHS } from "@mito/domain/export/period"
import { type Db, type DbError, query } from "@mito/server/effect/db"

/**
 * The `cleanupTaskEventLog` cron: deletes the event log rows older than three
 * months before `now`. Returns how many it deleted.
 */
export const cleanupTaskEventLog = (
  now: Date
): Effect.Effect<number, DbError, Db> =>
  Effect.gen(function* () {
    const cutoff = subMonths(now, RETENTION_MONTHS)

    const deleted = yield* query((client) =>
      client
        .delete(taskEventLog)
        .where(lt(taskEventLog.createdAt, cutoff))
        .returning({ id: taskEventLog.id })
    )
    return deleted.length
  })
