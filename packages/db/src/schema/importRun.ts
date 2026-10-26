import { sql } from "drizzle-orm"
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTableCreator,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const importFormat = ["wave", "standard"] as const
export const importFormatEnum = pgEnum("import_format", importFormat)

export const importRunStatus = [
  "running",
  "completed",
  "failed",
  "interrupted",
] as const
export const importRunStatusEnum = pgEnum("import_run_status", importRunStatus)

// The imports of clients and practices, one row each, for the history of the
// "Import" page (spec import-pratiche, AC28). Only who, when, which file and
// the counts: never the rows' data (AC31). At most one is running (D7)
export const importRun = createTable(
  "import_run",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    // When the queue's task took it: a task delivered again finds it taken
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    startedBy: varchar("started_by", { length: 255 })
      .notNull()
      .references(() => users.id),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    format: importFormatEnum("format").notNull(),
    status: importRunStatusEnum("status").notNull().default("running"),
    // Readable, with the row's number and the rule, never its values
    failureReason: varchar("failure_reason", { length: 1000 }),
    rowsTotal: integer("rows_total").notNull(),
    rowsDiscarded: integer("rows_discarded").notNull(),
    // What it wrote, once completed
    customersCreated: integer("customers_created"),
    customersUpdated: integer("customers_updated"),
    practicesCreated: integer("practices_created"),
    practicesUpdated: integer("practices_updated"),
    linksCreated: integer("links_created"),
  },
  (table) => ({
    oneRunning: uniqueIndex("import_run_one_running")
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    startedAt: index("import_run_started_at").on(table.startedAt.desc()),
  })
)

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => "bytea",
})

// The rows of a file between the confirmation and the end of its import, at
// most an hour (D14): gzip parts of the compact body (D3), deleted with the
// upload
export const importUpload = createTable("import_upload", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: varchar("created_by", { length: 255 })
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  format: importFormatEnum("format").notNull(),
  // The parts the browser will send
  parts: integer("parts").notNull(),
  // The import that uses them: from then on the upload takes no more parts
  runId: integer("run_id").references(() => importRun.id),
  // The rows the admin confirmed, by number, set with `runId`: the import
  // writes those and checks they are still what the preview showed (AC19b)
  expected: integer("expected").array(),
})

export const importUploadPart = createTable(
  "import_upload_part",
  {
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => importUpload.id, { onDelete: "cascade" }),
    part: integer("part").notNull(),
    data: bytea("data").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uploadId, table.part] }),
  })
)
