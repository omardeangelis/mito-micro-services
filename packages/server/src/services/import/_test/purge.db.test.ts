import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
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
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    return yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(
          DbLive,
          Layer.succeed(ImportConfig, importSettings),
          queue
        )
      ),
      Effect.exit
    )
  })

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
  it.effect("al primo pezzo parte un task di pulizia a +1 h", () =>
    Effect.gen(function* () {
      const uploadId = value(yield* run(firstPart()))

      expect(tasks).toEqual([
        {
          kind: "purge",
          uploadId,
          at: new Date("2026-10-25T11:00:00.000Z"),
        },
      ])
    })
  )

  it.effect("senza coda il primo pezzo è rifiutato e nulla resta (D13)", () =>
    Effect.gen(function* () {
      const exit = yield* run(firstPart(), importQueueDisabled)

      expect(failureTag(exit)).toBe("ImportUnavailable")
      expect(
        yield* Effect.promise(() => testDb.select().from(importUpload))
      ).toEqual([])
    })
  )

  it.effect("se la coda non prende la pulizia, le righe non restano", () =>
    Effect.gen(function* () {
      const refusing = Layer.succeed(ImportQueue, {
        available: true,
        enqueue: () =>
          Effect.fail(
            new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
          ),
      })

      const exit = yield* run(firstPart(), refusing)

      expect(failureTag(exit)).toBe("ImportQueueFailed")
      expect(
        yield* Effect.promise(() => testDb.select().from(importUpload))
      ).toEqual([])
      expect(
        yield* Effect.promise(() => testDb.select().from(importUploadPart))
      ).toEqual([])
    })
  )

  it.effect("il task cancella un upload abbandonato con i suoi pezzi", () =>
    Effect.gen(function* () {
      const uploadId = value(yield* run(firstPart(2)))
      value(
        yield* run(
          saveUploadPart({ uploadId, createdBy: admin, part: 1, data: body })
        )
      )

      const outcome = value(yield* run(purgeUpload(uploadId)))

      expect(outcome).toBe("deleted")
      expect(
        yield* Effect.promise(() => testDb.select().from(importUpload))
      ).toEqual([])
      expect(
        yield* Effect.promise(() => testDb.select().from(importUploadPart))
      ).toEqual([])
    })
  )

  it.effect(
    "il task lascia le righe di un import in corso e torna un minuto dopo la sua scadenza",
    () =>
      Effect.gen(function* () {
        const uploadId = value(yield* run(firstPart()))
        value(
          yield* run(startImport({ uploadId, expected: [2], startedBy: admin }))
        )
        tasks = []

        const outcome = value(yield* run(purgeUpload(uploadId)))

        expect(outcome).toBe("kept")
        expect(
          yield* Effect.promise(() =>
            testDb
              .select({ id: importUpload.id })
              .from(importUpload)
              .where(eq(importUpload.id, uploadId))
          )
        ).toEqual([{ id: uploadId }])
        // Started at NOW: the deadline is at +30 min
        expect(tasks).toEqual([
          { kind: "purge", uploadId, at: new Date("2026-10-25T10:31:00.000Z") },
        ])
      })
  )

  it.effect(
    "le righe di un import rimasto in corso oltre la scadenza vanno, e l'import è interrotto",
    () =>
      Effect.gen(function* () {
        const uploadId = value(yield* run(firstPart()))
        const { runId } = value(
          yield* run(startImport({ uploadId, expected: [2], startedBy: admin }))
        )
        // Its server stopped 31 minutes ago, and no start came since
        yield* Effect.promise(() =>
          testDb
            .update(importRun)
            .set({ startedAt: new Date("2026-10-25T09:29:00.000Z") })
            .where(eq(importRun.id, runId))
        )
        tasks = []

        const outcome = value(yield* run(purgeUpload(uploadId)))

        expect(outcome).toBe("interrupted")
        expect(
          yield* Effect.promise(() => testDb.select().from(importUpload))
        ).toEqual([])
        expect(
          yield* Effect.promise(() => testDb.select().from(importUploadPart))
        ).toEqual([])
        expect(
          yield* Effect.promise(() =>
            testDb
              .select({
                status: importRun.status,
                failureReason: importRun.failureReason,
                finishedAt: importRun.finishedAt,
              })
              .from(importRun)
          )
        ).toEqual([
          {
            status: "interrupted",
            failureReason: "L'import non è finito entro 30 minuti dall'inizio",
            finishedAt: NOW,
          },
        ])
        expect(tasks).toEqual([])
      })
  )

  it.effect(
    "se la coda non riprende la pulizia, il task fallisce e la coda lo ripete",
    () =>
      Effect.gen(function* () {
        const uploadId = value(yield* run(firstPart()))
        value(
          yield* run(startImport({ uploadId, expected: [2], startedBy: admin }))
        )
        const refusing = Layer.succeed(ImportQueue, {
          available: true,
          enqueue: () =>
            Effect.fail(
              new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
            ),
        })

        const exit = yield* run(purgeUpload(uploadId), refusing)

        expect(failureTag(exit)).toBe("ImportQueueFailed")
        expect(
          yield* Effect.promise(() => testDb.select().from(importUpload))
        ).toHaveLength(1)
      })
  )

  it.effect(
    "le righe di un import finito sono già andate: il task non trova nulla",
    () =>
      Effect.gen(function* () {
        const uploadId = value(yield* run(firstPart()))
        const { runId } = value(
          yield* run(startImport({ uploadId, expected: [2], startedBy: admin }))
        )
        yield* Effect.promise(() =>
          testDb
            .update(importRun)
            .set({ status: "failed" })
            .where(eq(importRun.id, runId))
        )

        const outcome = value(yield* run(purgeUpload(uploadId)))

        // An upload whose run ended keeps nothing: the end deletes it, and so
        // does this task if it didn't
        expect(outcome).toBe("deleted")
        expect(value(yield* run(purgeUpload(uploadId)))).toBe("gone")
      })
  )
})
