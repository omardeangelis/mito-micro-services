import { Effect } from "effect"
import { eq, sql } from "drizzle-orm"
import { cronRun } from "@mito/db/schema/cronRun"
import { query } from "@mito/server/effect/db"

/**
 * Records the start of `job` on `day` (UTC, yyyy-MM-dd) and returns the id of
 * the run, or `undefined` when the job has a run that day already: running,
 * succeeded, or failed. A `rerunnable` job may take the place of a failed run.
 * The unique (job, day) row decides it in the database, so two calls at the
 * same time start one run.
 */
export const startRun = (job: string, day: string, rerunnable: boolean) =>
  query((client) => {
    const insert = client
      .insert(cronRun)
      .values({ job, runDay: day, status: "running" })
    const target = [cronRun.job, cronRun.runDay]
    return (
      rerunnable
        ? insert.onConflictDoUpdate({
            target,
            set: {
              status: "running",
              startedAt: sql`CURRENT_TIMESTAMP`,
              finishedAt: null,
              counters: null,
            },
            setWhere: eq(cronRun.status, "failed"),
          })
        : insert.onConflictDoNothing({ target })
    ).returning({ id: cronRun.id })
  }).pipe(Effect.map(([row]) => row?.id))

/** Records how the run ended, with its counts when it succeeded. */
export const finishRun = (
  id: number,
  status: "succeeded" | "failed",
  counters: Record<string, number> | null
) =>
  query((client) =>
    client
      .update(cronRun)
      .set({ status, finishedAt: sql`CURRENT_TIMESTAMP`, counters })
      .where(eq(cronRun.id, id))
  ).pipe(Effect.asVoid)
