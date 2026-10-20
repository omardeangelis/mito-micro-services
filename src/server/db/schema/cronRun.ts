import { sql } from "drizzle-orm"
import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const cronRunStatus = ["running", "succeeded", "failed"] as const

export const cronRunStatusEnum = pgEnum("cron_run_status", cronRunStatus)

// The runs of the backend's crons (api/src/cron), one per job and UTC day: a
// second call on the same day finds the row and doesn't run the job. It keeps
// `update`, which adds a year to the ages at every run, to once a day, and
// keeps two runs of a job from overlapping
export const cronRun = createTable(
  "cron_run",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
    job: varchar("job", { length: 64 }).notNull(),
    runDay: date("run_day").notNull(),
    status: cronRunStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Only counts (found, processed, failed…): never the rows' data
    counters: jsonb("counters").$type<Record<string, number>>(),
  },
  (table) => ({
    jobDay: unique("cron_run_job_day").on(table.job, table.runDay),
  })
)
