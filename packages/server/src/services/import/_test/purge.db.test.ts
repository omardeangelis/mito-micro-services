import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import { eq } from "drizzle-orm"
import { Clock, Effect, Exit, Layer } from "effect"
import {
  importRun,
  importUpload,
  importUploadPart,
} from "@mito/db/schema/importRun"
import { waveColumns } from "@mito/domain/import/formats"
import { toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { type Db, DbLive } from "../../../effect/db"
import { ImportConfig, importSettings } from "../config"
import { ImportQueueFailed } from "../errors"
import { ImportQueue, type ImportTask, importQueueDisabled } from "../queue"
import { purgeUpload, startImport } from "../run"
import { beginUpload, saveUploadPart } from "../upload"
import { fixedClock } from "../../analytics/_test/clock"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag } from "@/test/effect"
import { createUser } from "@/test/factories"

// The rows of a file wait an hour at most (T10b, D14): the first part queues
// their cleanup, which leaves alone the rows of an import

const NOW = new Date("2026-10-25T10:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

let tasks: ImportTask[]
let admin: string

beforeEach(async () => {
  await resetDb()
  tasks = []
  admin = (await createUser({ role: "ADMIN" })).id
})

const recordingQueue = Layer.succeed(ImportQueue, {
  available: true,
  enqueue: (task) => Effect.sync(() => void tasks.push(task)),
})

const run = <A, E>(
  program: Effect.Effect<A, E, Db | ImportConfig | ImportQueue>,
  queue: Layer.Layer<ImportQueue> = recordingQueue
) =>
  Effect.runPromiseExit(
    program.pipe(
      Effect.provideService(Clock.Clock, fixedClock(NOW.getTime())),
      Effect.provide(
        Layer.mergeAll(
          DbLive,
          Layer.succeed(ImportConfig, importSettings),
          queue
        )
      )
    )
  )

const value = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) throw new Error(`failed: ${String(exit.cause)}`)
  return exit.value
}

const body = gzipSync(
  JSON.stringify(
    toFileBody(waveColumns, [
      { row: 2, cells: waveCells({ "n° Pratica": "P1", "Codice NDG": "1" }) },
    ])
  )
)
const firstPart = (parts = 1) =>
  beginUpload({
    createdBy: admin,
    fileName: "0125_import.xlsx",
    format: "wave",
    parts,
    data: body,
  })

describe("pulizia delle righe temporanee", () => {
  test("al primo pezzo parte un task di pulizia a +1 h", async () => {
    const uploadId = value(await run(firstPart()))

    expect(tasks).toEqual([
      {
        kind: "purge",
        uploadId,
        at: new Date("2026-10-25T11:00:00.000Z"),
      },
    ])
  })

  test("senza coda il primo pezzo è rifiutato e nulla resta (D13)", async () => {
    const exit = await run(firstPart(), importQueueDisabled)

    expect(failureTag(exit)).toBe("ImportUnavailable")
    expect(await testDb.select().from(importUpload)).toEqual([])
  })

  test("se la coda non prende la pulizia, le righe non restano", async () => {
    const refusing = Layer.succeed(ImportQueue, {
      available: true,
      enqueue: () =>
        Effect.fail(
          new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
        ),
    })

    const exit = await run(firstPart(), refusing)

    expect(failureTag(exit)).toBe("ImportQueueFailed")
    expect(await testDb.select().from(importUpload)).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })

  test("il task cancella un upload abbandonato con i suoi pezzi", async () => {
    const uploadId = value(await run(firstPart(2)))
    value(
      await run(
        saveUploadPart({ uploadId, createdBy: admin, part: 1, data: body })
      )
    )

    const outcome = value(await run(purgeUpload(uploadId)))

    expect(outcome).toBe("deleted")
    expect(await testDb.select().from(importUpload)).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })

  test("il task lascia le righe di un import in corso e torna un minuto dopo la sua scadenza", async () => {
    const uploadId = value(await run(firstPart()))
    value(await run(startImport({ uploadId, expected: [2], startedBy: admin })))
    tasks = []

    const outcome = value(await run(purgeUpload(uploadId)))

    expect(outcome).toBe("kept")
    expect(
      await testDb
        .select({ id: importUpload.id })
        .from(importUpload)
        .where(eq(importUpload.id, uploadId))
    ).toEqual([{ id: uploadId }])
    // Started at NOW: the deadline is at +30 min
    expect(tasks).toEqual([
      { kind: "purge", uploadId, at: new Date("2026-10-25T10:31:00.000Z") },
    ])
  })

  test("le righe di un import rimasto in corso oltre la scadenza vanno, e l'import è interrotto", async () => {
    const uploadId = value(await run(firstPart()))
    const { runId } = value(
      await run(startImport({ uploadId, expected: [2], startedBy: admin }))
    )
    // Its server stopped 31 minutes ago, and no start came since
    await testDb
      .update(importRun)
      .set({ startedAt: new Date("2026-10-25T09:29:00.000Z") })
      .where(eq(importRun.id, runId))
    tasks = []

    const outcome = value(await run(purgeUpload(uploadId)))

    expect(outcome).toBe("interrupted")
    expect(await testDb.select().from(importUpload)).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
    expect(
      await testDb
        .select({
          status: importRun.status,
          failureReason: importRun.failureReason,
          finishedAt: importRun.finishedAt,
        })
        .from(importRun)
    ).toEqual([
      {
        status: "interrupted",
        failureReason: "L'import non è finito entro 30 minuti dall'inizio",
        finishedAt: NOW,
      },
    ])
    expect(tasks).toEqual([])
  })

  test("se la coda non riprende la pulizia, il task fallisce e la coda lo ripete", async () => {
    const uploadId = value(await run(firstPart()))
    value(await run(startImport({ uploadId, expected: [2], startedBy: admin })))
    const refusing = Layer.succeed(ImportQueue, {
      available: true,
      enqueue: () =>
        Effect.fail(
          new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
        ),
    })

    const exit = await run(purgeUpload(uploadId), refusing)

    expect(failureTag(exit)).toBe("ImportQueueFailed")
    expect(await testDb.select().from(importUpload)).toHaveLength(1)
  })

  test("le righe di un import finito sono già andate: il task non trova nulla", async () => {
    const uploadId = value(await run(firstPart()))
    const { runId } = value(
      await run(startImport({ uploadId, expected: [2], startedBy: admin }))
    )
    await testDb
      .update(importRun)
      .set({ status: "failed" })
      .where(eq(importRun.id, runId))

    const outcome = value(await run(purgeUpload(uploadId)))

    // An upload whose run ended keeps nothing: the end deletes it, and so
    // does this task if it didn't
    expect(outcome).toBe("deleted")
    expect(value(await run(purgeUpload(uploadId)))).toBe("gone")
  })
})
