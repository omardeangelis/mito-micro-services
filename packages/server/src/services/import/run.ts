import { and, eq, inArray, isNull, lt } from "drizzle-orm"
import { Cause, Clock, Effect, Exit, Option } from "effect"
import { importRun, importUpload } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { classifyRows } from "@mito/domain/import/classify"
import { DbError, query, retryOnDeadlock, transaction } from "../../effect/db"
import { adminName, timeInRome } from "./admin"
import { applyImport } from "./apply"
import { ImportConfig } from "./config"
import {
  ImportAlreadyRunning,
  ImportInputInvalid,
  ImportRowRejected,
  ImportTimedOut,
  ImportUnavailable,
  ImportUploadClosed,
  ImportUploadMissing,
} from "./errors"
import { ImportQueue } from "./queue"
import { deleteUpload, loadUpload, lockUpload } from "./upload"

// The start of a confirmed import and its run from the queue (D1, D7–D10).
// One import at a time: the unique index on the running row. The rows wait in
// the upload until the import ends, and go with it

/**
 * Why an import ended without writing, as the history shows it (AC29, AC30):
 * readable, never a value of the rows (AC31).
 */
export const failureReasons = {
  timedOut: "L'import non è finito entro 30 minuti dall'inizio",
  queueFailed: "La coda dell'import non ha accettato l'import",
  rowsMissing: "Le righe del file non ci sono più",
  unexpected: "Errore imprevisto del server",
  database: (code: string | undefined) =>
    `Errore del database${code ? ` (codice ${code})` : ""}`,
  row: (row: number, rule: string) => `Riga ${row}: ${rule}`,
}

type Ending = {
  status: "failed" | "interrupted"
  reason: string
}

/**
 * Ends a running import without its writes, in a transaction of its own
 * (D9): the status, the reason, and its rows deleted. One that has ended
 * already stays as it is.
 */
const endRun = (runId: number, ending: Ending, finishedAt: Date) =>
  transaction(
    Effect.gen(function* () {
      yield* query((client) =>
        client
          .update(importRun)
          .set({
            status: ending.status,
            failureReason: ending.reason,
            finishedAt,
          })
          .where(and(eq(importRun.id, runId), eq(importRun.status, "running")))
      )
      yield* query((client) =>
        client.delete(importUpload).where(eq(importUpload.runId, runId))
      )
    })
  )

/** Imports past their deadline become interrupted, and their rows go (D8). */
const interrupt = (ids: number[], now: number) =>
  Effect.gen(function* () {
    yield* query((client) =>
      client
        .update(importRun)
        .set({
          status: "interrupted",
          failureReason: failureReasons.timedOut,
          finishedAt: new Date(now),
        })
        .where(inArray(importRun.id, ids))
    )
    yield* query((client) =>
      client.delete(importUpload).where(inArray(importUpload.runId, ids))
    )
  })

/**
 * The imports still running `timeoutMs` after their start that no
 * transaction holds become interrupted, and their rows go (D8, AC30). One a
 * transaction holds is an import still writing: it stops at its deadline.
 */
export const interruptExpired = Effect.gen(function* () {
  const { timeoutMs } = yield* ImportConfig
  const now = yield* Clock.currentTimeMillis
  yield* transaction(
    Effect.gen(function* () {
      const expired = yield* query((client) =>
        client
          .select({ id: importRun.id })
          .from(importRun)
          .where(
            and(
              eq(importRun.status, "running"),
              lt(importRun.startedAt, new Date(now - timeoutMs))
            )
          )
          .for("update", { skipLocked: true })
      )
      if (expired.length > 0)
        yield* interrupt(
          expired.map(({ id }) => id),
          now
        )
    })
  )
})

/** How long after an import's deadline its cleanup comes again (D14). */
export const PURGE_AFTER_DEADLINE_MS = 60_000

/**
 * The cleanup task of an upload (`POST /internal/import/purge/:uploadId`,
 * D14): deletes it with its parts. It waits for a part or a start that holds
 * the row; after a start the upload is the import's, which deletes it at its
 * end.
 *
 * - The upload of an import running past its deadline that no transaction
 *   holds: the import becomes interrupted (AC30) and its rows go, so they
 *   don't stay when its server has stopped.
 * - The upload of an import still running, or held by a transaction: kept,
 *   and the cleanup comes again a minute after the deadline (or now, if it
 *   has passed).
 */
export const purgeUpload = (uploadId: string) =>
  Effect.gen(function* () {
    const { timeoutMs } = yield* ImportConfig
    const now = yield* Clock.currentTimeMillis
    const purge = yield* transaction(
      Effect.gen(function* () {
        const [upload] = yield* query((client) =>
          client
            .select({ id: importUpload.id, runId: importUpload.runId })
            .from(importUpload)
            .where(eq(importUpload.id, uploadId))
            .for("update")
        )
        if (!upload) return { outcome: "gone" as const }
        const { runId } = upload
        if (runId !== null) {
          const [run] = yield* query((client) =>
            client
              .select({
                status: importRun.status,
                startedAt: importRun.startedAt,
              })
              .from(importRun)
              .where(eq(importRun.id, runId))
          )
          if (run?.status === "running") {
            const deadline = run.startedAt.getTime() + timeoutMs
            if (now < deadline) {
              return {
                outcome: "kept" as const,
                again: deadline + PURGE_AFTER_DEADLINE_MS,
              }
            }
            // A transaction that holds it is the import, or its end
            const [free] = yield* query((client) =>
              client
                .select({ id: importRun.id })
                .from(importRun)
                .where(
                  and(eq(importRun.id, runId), eq(importRun.status, "running"))
                )
                .for("update", { skipLocked: true })
            )
            if (!free) {
              return {
                outcome: "kept" as const,
                again: now + PURGE_AFTER_DEADLINE_MS,
              }
            }
            yield* interrupt([runId], now)
            return { outcome: "interrupted" as const }
          }
        }
        yield* deleteUpload(upload.id)
        return { outcome: "deleted" as const }
      })
    )
    if (purge.outcome === "kept") {
      yield* (yield* ImportQueue).enqueue({
        kind: "purge",
        uploadId,
        at: new Date(purge.again),
      })
    }
    return purge.outcome
  })

/** The import running now, if any, with the name of its admin. */
const runningImport = query((client) =>
  client
    .select({ startedBy: adminName, startedAt: importRun.startedAt })
    .from(importRun)
    .innerJoin(users, eq(users.id, importRun.startedBy))
    .leftJoin(operators, eq(operators.userId, users.id))
    .where(eq(importRun.status, "running"))
    .limit(1)
).pipe(Effect.map(([run]) => Option.fromNullishOr(run)))

const alreadyRunning = (run: { startedBy: string; startedAt: Date }) =>
  new ImportAlreadyRunning({
    startedBy: run.startedBy,
    time: timeInRome(run.startedAt),
  })

const isUniqueViolation = (error: unknown): error is DbError =>
  error instanceof DbError && error.code === "23505"

export type StartInput = {
  uploadId: string
  /** The rows the preview gave as importable or customer only (D10) */
  expected: readonly number[]
  /** The admin: only their own upload starts */
  startedBy: string
}

/**
 * The running row of the import and its link to the upload, in one
 * transaction. A second running row fails on the unique index (23505).
 */
const createRun = (input: StartInput, now: Date) =>
  transaction(
    Effect.gen(function* () {
      const upload = yield* lockUpload(input.uploadId, input.startedBy)
      if (upload.runId !== null) {
        // A second confirmation of the same file: its import is running
        const running = yield* runningImport
        return yield* Option.isSome(running)
          ? Effect.fail(alreadyRunning(running.value))
          : Effect.fail(new ImportUploadClosed({ uploadId: upload.id }))
      }

      const expected = [...new Set(input.expected)].sort((a, b) => a - b)
      if (expected.length === 0) {
        return yield* new ImportInputInvalid({
          reason: "Il file non ha righe da importare",
        })
      }
      const { rows } = yield* loadUpload(upload.id)
      const classified = classifyRows(upload.format, rows, now, upload.fileName)
      const byRow = new Map(classified.map((row) => [row.row, row]))
      for (const row of expected) {
        const found = byRow.get(row)
        if (!found) {
          return yield* new ImportInputInvalid({
            reason: `La riga ${row} attesa non è tra le righe del file`,
          })
        }
        // The rules that don't depend on the CRM: the import checks the
        // others on the CRM it locks
        if (found.kind === "discarded") {
          return yield* new ImportRowRejected({
            row,
            rule: found.reasons.join("; "),
          })
        }
      }

      const [run] = yield* query((client) =>
        client
          .insert(importRun)
          .values({
            startedAt: now,
            startedBy: input.startedBy,
            fileName: upload.fileName,
            format: upload.format,
            rowsTotal: classified.length,
            rowsDiscarded: classified.length - expected.length,
          })
          .returning({ id: importRun.id })
      )
      yield* query((client) =>
        client
          .update(importUpload)
          .set({ runId: run!.id, expected })
          .where(eq(importUpload.id, upload.id))
      )
      return run!.id
    })
  )

/**
 * Starts the import of the admin's upload (`import.start`): the running row,
 * then the task in the queue. It answers once the task is queued; the
 * outcome reaches the history (AC20).
 *
 * - An import running for more than 30 minutes that nobody runs becomes
 *   interrupted first (AC30).
 * - With an import running, `ImportAlreadyRunning` with its admin and time
 *   (AC22), and nothing written.
 * - If the queue doesn't take the task, the import is failed, its rows go,
 *   and the admin gets the error.
 */
export const startImport = (input: StartInput) =>
  Effect.gen(function* () {
    const queue = yield* ImportQueue
    if (!queue.available) return yield* new ImportUnavailable()
    yield* interruptExpired
    const now = new Date(yield* Clock.currentTimeMillis)

    const runId = yield* createRun(input, now).pipe(
      Effect.catchIf(isUniqueViolation, () =>
        Effect.flatMap(runningImport, (running) =>
          Option.isSome(running)
            ? Effect.fail(alreadyRunning(running.value))
            : // It ended between its insert and this read: one more go
              createRun(input, now)
        )
      )
    )

    yield* queue
      .enqueue({ kind: "run", runId })
      .pipe(
        Effect.tapError(() =>
          Effect.flatMap(Clock.currentTimeMillis, (at) =>
            endRun(
              runId,
              { status: "failed", reason: failureReasons.queueFailed },
              new Date(at)
            )
          )
        )
      )
    return { runId }
  })

/** How a failed run ends, and what the log says of it: no values. */
const endingOf = (cause: Cause.Cause<unknown>): Ending & { log: string } => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause))
  if (
    error instanceof ImportTimedOut ||
    (error instanceof DbError && error.code === "57014")
  ) {
    return {
      status: "interrupted",
      reason: failureReasons.timedOut,
      log: error._tag,
    }
  }
  if (error instanceof ImportRowRejected) {
    return {
      status: "failed",
      reason: failureReasons.row(error.row, error.rule),
      log: `${error._tag} row ${error.row}`,
    }
  }
  if (error instanceof ImportInputInvalid) {
    return { status: "failed", reason: error.reason, log: error._tag }
  }
  if (error instanceof ImportUploadMissing) {
    return {
      status: "failed",
      reason: failureReasons.rowsMissing,
      log: error._tag,
    }
  }
  if (error instanceof DbError) {
    return {
      status: "failed",
      reason: failureReasons.database(error.code),
      log: `${error._tag} ${error.code ?? "?"}`,
    }
  }
  // A defect: its message may hold a value, so only its kind
  const defect = Cause.squash(cause)
  return {
    status: "failed",
    reason: failureReasons.unexpected,
    log: `defect ${defect instanceof Error ? defect.name : typeof defect}`,
  }
}

export type RunOutcome = "completed" | "failed" | "interrupted" | "skipped"

/**
 * Runs an import from its task (`POST /internal/import/run/:id`).
 *
 * - It takes the run first, committed on its own (D7): a task delivered
 *   again, or for an import that isn't running, does nothing ("skipped").
 * - The writes, the counts and the deletion of the rows in one transaction
 *   (D5, D9), again on a deadlock, until the deadline of 30 minutes from the
 *   start (D8).
 * - After a rollback, the run is failed or interrupted in a transaction of
 *   its own, with a readable reason (AC29, AC30), and its rows go.
 */
export const executeImport = (runId: number) =>
  Effect.gen(function* () {
    const { timeoutMs } = yield* ImportConfig
    const now = new Date(yield* Clock.currentTimeMillis)
    const [claimed] = yield* query((client) =>
      client
        .update(importRun)
        .set({ claimedAt: now })
        .where(
          and(
            eq(importRun.id, runId),
            eq(importRun.status, "running"),
            isNull(importRun.claimedAt)
          )
        )
        .returning({ id: importRun.id })
    )
    if (!claimed) return "skipped" as const

    const exit = yield* Effect.exit(
      retryOnDeadlock(
        transaction(
          Effect.gen(function* () {
            // Held to the end: the cleanup of D8 leaves it alone
            const [run] = yield* query((client) =>
              client
                .select()
                .from(importRun)
                .where(eq(importRun.id, runId))
                .for("update")
            )
            if (run?.status !== "running") return false
            const [upload] = yield* query((client) =>
              client
                .select({
                  id: importUpload.id,
                  expected: importUpload.expected,
                })
                .from(importUpload)
                .where(eq(importUpload.runId, runId))
            )
            if (!upload) {
              return yield* new ImportInputInvalid({
                reason: failureReasons.rowsMissing,
              })
            }
            const { rows } = yield* loadUpload(upload.id)
            const counts = yield* applyImport({
              format: run.format,
              fileName: run.fileName,
              rows,
              expected: upload.expected ?? [],
              now,
              deadline: run.startedAt.getTime() + timeoutMs,
            })
            const finishedAt = new Date(yield* Clock.currentTimeMillis)
            yield* query((client) =>
              client
                .update(importRun)
                .set({ status: "completed", finishedAt, ...counts })
                .where(eq(importRun.id, runId))
            )
            yield* deleteUpload(upload.id)
            return true
          })
        )
      )
    )

    if (Exit.isSuccess(exit)) {
      return exit.value ? ("completed" as const) : ("skipped" as const)
    }
    const ending = endingOf(exit.cause)
    yield* endRun(runId, ending, new Date(yield* Clock.currentTimeMillis))
    yield* Effect.logWarning(`Import ${runId} ${ending.status}: ${ending.log}`)
    return ending.status
  })
