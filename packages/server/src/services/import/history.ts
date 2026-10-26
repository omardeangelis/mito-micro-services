import "server-only"
import { count, desc, eq } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { importRun } from "@mito/db/schema/importRun"
import { HISTORY_PAGE_SIZE } from "@mito/domain/import/payload"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type DbClient, query } from "../../effect/db"
import { adminName } from "./admin"
import { ImportConfig } from "./config"
import { failureReasons } from "./run"

// The history of the imports (AC28–AC31): who, when, which file, how it
// ended and the counts. Never the rows' data, which the table doesn't hold

export { HISTORY_PAGE_SIZE }

const columns = {
  id: importRun.id,
  startedAt: importRun.startedAt,
  finishedAt: importRun.finishedAt,
  startedBy: adminName,
  fileName: importRun.fileName,
  format: importRun.format,
  status: importRun.status,
  failureReason: importRun.failureReason,
  rowsTotal: importRun.rowsTotal,
  rowsDiscarded: importRun.rowsDiscarded,
  customersCreated: importRun.customersCreated,
  customersUpdated: importRun.customersUpdated,
  practicesCreated: importRun.practicesCreated,
  practicesUpdated: importRun.practicesUpdated,
  linksCreated: importRun.linksCreated,
}

/** The runs with the name of their admin. */
const selectRuns = (client: DbClient) =>
  client
    .select(columns)
    .from(importRun)
    .innerJoin(users, eq(users.id, importRun.startedBy))
    .leftJoin(operators, eq(operators.userId, users.id))

type Row = Awaited<ReturnType<typeof selectRuns>>[number]

export type ImportSummary = Row & {
  /** From the start to the end; none while it runs */
  durationMs: number | null
}

/**
 * The row as the history shows it: one still running past its deadline is
 * interrupted (AC30), whether or not a cleanup has written it yet.
 */
const summarize =
  (now: number, timeoutMs: number) =>
  (row: Row): ImportSummary => {
    if (row.status === "running" && row.startedAt.getTime() < now - timeoutMs) {
      return {
        ...row,
        status: "interrupted",
        failureReason: failureReasons.timedOut,
        durationMs: null,
      }
    }
    return {
      ...row,
      durationMs: row.finishedAt
        ? row.finishedAt.getTime() - row.startedAt.getTime()
        : null,
    }
  }

const summarizer = Effect.gen(function* () {
  const { timeoutMs } = yield* ImportConfig
  return summarize(yield* Clock.currentTimeMillis, timeoutMs)
})

/** A page of the history, from the most recent import, and how many there are. */
export const listImports = (page: number) =>
  Effect.gen(function* () {
    const offset = (Math.max(1, Math.floor(page)) - 1) * HISTORY_PAGE_SIZE
    const rows = yield* query((client) =>
      selectRuns(client)
        .orderBy(desc(importRun.startedAt), desc(importRun.id))
        .limit(HISTORY_PAGE_SIZE)
        .offset(offset)
    )
    const [total] = yield* query((client) =>
      client.select({ count: count() }).from(importRun)
    )
    const toSummary = yield* summarizer
    return { imports: rows.map(toSummary), total: total?.count ?? 0 }
  })

/**
 * The admin's latest import, if any (D15): while it runs the page asks again
 * every 3 seconds, and its end is the notice (AC21).
 */
export const activeImport = (startedBy: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((client) =>
      selectRuns(client)
        .where(eq(importRun.startedBy, startedBy))
        .orderBy(desc(importRun.startedAt), desc(importRun.id))
        .limit(1)
    )
    return row ? (yield* summarizer)(row) : null
  })
