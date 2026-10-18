import { lt } from "drizzle-orm"
import { subMonths } from "date-fns"
import { db } from "@/server/db"
import { taskEventLog } from "@/server/db/schema/taskEventLog"

const RETENTION_MONTHS = 3

/**
 * The `cleanupTaskEventLog` cron: deletes the event log rows older than three
 * months before `now`. Returns how many it deleted.
 */
export async function cleanupTaskEventLog(now: Date): Promise<number> {
  const cutoff = subMonths(now, RETENTION_MONTHS)

  const deleted = await db
    .delete(taskEventLog)
    .where(lt(taskEventLog.createdAt, cutoff))
    .returning({ id: taskEventLog.id })
  return deleted.length
}
