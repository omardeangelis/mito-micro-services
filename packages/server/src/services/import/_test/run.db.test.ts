import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { asc, eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
import { customers } from "@mito/db/schema/customers"
import {
  importRun,
  importUpload,
  importUploadPart,
} from "@mito/db/schema/importRun"
import { practices } from "@mito/db/schema/pratiche"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { type Db, DbLive } from "../../../effect/db"
import { ImportConfig, type ImportSettings, importSettings } from "../config"
import { ImportQueueFailed } from "../errors"
import {
  ImportQueue,
  type ImportTask,
  importQueueDisabled,
  importQueueInProcess,
} from "../queue"
import { executeImport, startImport } from "../run"
import { createUpload } from "../upload"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag } from "@/test/effect"
import { createCustomer, createOperator, createUser } from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

// The start of an import and its run from the queue (T10a): AC20, AC22,
// AC29, AC30, AC31, D7, D8, D9, D13

/** 10:05 in Rome, on the day the clocks go back. */
const START = new Date("2026-10-25T09:05:00.000Z")
const FILE_NAME = "0125_import.xlsx"
const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"
const CF_C = "BNCGNN70C03L219Y"

beforeAll(async () => {
  await migrateUpTo()
})

let tasks: ImportTask[]

beforeEach(async () => {
  await resetDb()
  tasks = []
})

/** A queue that keeps the tasks: the test delivers them. */
const recordingQueue = Layer.succeed(ImportQueue, {
  available: true,
  enqueue: (task) => Effect.sync(() => void tasks.push(task)),
})

const run = <A, E>(
  program: Effect.Effect<A, E, Db | ImportConfig | ImportQueue>,
  {
    at = START,
    queue = recordingQueue,
    settings = importSettings,
  }: {
    // `null`: the real clock, for a test that runs in `it.live`
    at?: Date | null
    queue?: Layer.Layer<ImportQueue>
    settings?: ImportSettings
  } = {}
) =>
  Effect.gen(function* () {
    if (at !== null) yield* TestClock.setTime(at.getTime())
    return yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(DbLive, Layer.succeed(ImportConfig, settings), queue)
      ),
      Effect.exit
    )
  })

const value = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) throw new Error(`failed: ${String(exit.cause)}`)
  return exit.value
}

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) &&
  exit.cause.reasons.length === 1 &&
  Cause.isFailReason(exit.cause.reasons[0]!)
    ? exit.cause.reasons[0].error
    : undefined

const numbered = (rows: Cells[]) =>
  rows.map((cells, index) => ({ row: index + 2, cells: waveCells(cells) }))

/** The rows of a Wave file, all arrived, as `import.upload` leaves them. */
const uploadOf = (
  createdBy: string,
  rows: Cells[],
  fileName = FILE_NAME,
  at: Date | null = START
) =>
  Effect.gen(function* () {
    return value(
      yield* run(
        createUpload({
          createdBy,
          fileName,
          format: "wave",
          parts: 1,
          data: gzipSync(
            JSON.stringify(toFileBody(waveColumns, numbered(rows)))
          ),
        }),
        { at }
      )
    )
  })

const twoRows = [
  { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
  { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
]

/** Without fiscal code and customer code: the preview discards it. */
const discardedRow = {
  "Codice Fiscale": "",
  "Codice NDG": "",
  "n° Pratica": "P3",
}

const runs = () => testDb.select().from(importRun).orderBy(asc(importRun.id))
const uploads = () => testDb.select().from(importUpload)
const customerCodes = async () =>
  (
    await testDb
      .select({ tempID: customers.tempID })
      .from(customers)
      .orderBy(asc(customers.tempID))
  ).map(({ tempID }) => tempID)

describe("avvio dell'import", () => {
  it.effect(
    "con un import in corso, una seconda startImport fallisce con ImportAlreadyRunning: nome dell'admin del primo e ora di inizio a Roma",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({
            role: "ADMIN",
            name: "Anna",
            surname: "Rossi",
          })
        )
        const other = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const first = yield* uploadOf(anna.userId, twoRows)
        const second = yield* uploadOf(other.id, twoRows)
        value(
          yield* run(
            startImport({
              uploadId: first,
              expected: [2, 3],
              startedBy: anna.userId,
            })
          )
        )

        const exit = yield* run(
          startImport({
            uploadId: second,
            expected: [2, 3],
            startedBy: other.id,
          }),
          { at: new Date("2026-10-25T09:20:00.000Z") }
        )

        expect(failureOf(exit)).toMatchObject({
          _tag: "ImportAlreadyRunning",
          startedBy: "Anna Rossi",
          time: "10:05",
        })
        expect(yield* Effect.promise(() => runs())).toHaveLength(1)
        expect(
          (yield* Effect.promise(() => uploads())).find(
            ({ id }) => id === second
          )?.runId
        ).toBeNull()
      })
  )

  it.effect("un admin senza riga operatore si legge con la sua email", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const other = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const first = yield* uploadOf(admin.id, twoRows)
      const second = yield* uploadOf(other.id, twoRows)
      value(
        yield* run(
          startImport({
            uploadId: first,
            expected: [2, 3],
            startedBy: admin.id,
          })
        )
      )

      const exit = yield* run(
        startImport({ uploadId: second, expected: [2, 3], startedBy: other.id })
      )

      expect(failureOf(exit)).toMatchObject({
        _tag: "ImportAlreadyRunning",
        startedBy: admin.email,
      })
    })
  )

  it.effect(
    "il doppio clic sulla conferma: la seconda startImport dello stesso upload fallisce con ImportAlreadyRunning",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN", name: "Anna" })
        )
        const uploadId = yield* uploadOf(admin.userId, twoRows)
        const start = startImport({
          uploadId,
          expected: [2, 3],
          startedBy: admin.userId,
        })
        value(yield* run(start))

        const exit = yield* run(start)

        expect(failureTag(exit)).toBe("ImportAlreadyRunning")
        expect(yield* Effect.promise(() => runs())).toHaveLength(1)
        expect(tasks).toHaveLength(1)
      })
  )

  it.effect(
    "salva l'import in corso con i numeri dell'anteprima, collega le righe e mette il task in coda",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(admin.id, [...twoRows, discardedRow])

        const { runId } = value(
          yield* run(
            startImport({ uploadId, expected: [3, 2], startedBy: admin.id })
          )
        )

        expect(yield* Effect.promise(() => runs())).toEqual([
          expect.objectContaining({
            id: runId,
            startedAt: START,
            claimedAt: null,
            finishedAt: null,
            startedBy: admin.id,
            fileName: FILE_NAME,
            format: "wave",
            status: "running",
            failureReason: null,
            rowsTotal: 3,
            rowsDiscarded: 1,
            customersCreated: null,
          }),
        ])
        expect(yield* Effect.promise(() => uploads())).toEqual([
          expect.objectContaining({ id: uploadId, runId, expected: [2, 3] }),
        ])
        expect(tasks).toEqual([{ kind: "run", runId }])
      })
  )

  it.effect(
    "le righe attese devono esserci e potersi importare: altrimenti nulla parte",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(admin.id, [...twoRows, discardedRow])
        const start = (expected: number[]) =>
          run(startImport({ uploadId, expected, startedBy: admin.id }))

        const absent = yield* start([2, 9])
        const discarded = yield* start([2, 4])
        const none = yield* start([])

        expect(failureOf(absent)).toMatchObject({
          _tag: "ImportInputInvalid",
          reason: "La riga 9 attesa non è tra le righe del file",
        })
        expect(failureOf(discarded)).toMatchObject({
          _tag: "ImportRowRejected",
          row: 4,
        })
        expect(failureOf(none)).toMatchObject({
          _tag: "ImportInputInvalid",
          reason: "Il file non ha righe da importare",
        })
        expect(yield* Effect.promise(() => runs())).toEqual([])
        expect(tasks).toEqual([])
      })
  )

  it.effect("l'upload di un altro admin non si avvia", () =>
    Effect.gen(function* () {
      const [owner, other] = [
        yield* Effect.promise(() => createUser({ role: "ADMIN" })),
        yield* Effect.promise(() => createUser({ role: "ADMIN" })),
      ]
      const uploadId = yield* uploadOf(owner.id, twoRows)

      const exit = yield* run(
        startImport({ uploadId, expected: [2, 3], startedBy: other.id })
      )

      expect(failureTag(exit)).toBe("ImportUploadMissing")
      expect(yield* Effect.promise(() => runs())).toEqual([])
    })
  )

  it.effect(
    "senza coda l'import non parte: ImportUnavailable e nulla scritto (D13)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(admin.id, twoRows)

        const exit = yield* run(
          startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
          { queue: importQueueDisabled }
        )

        expect(failureTag(exit)).toBe("ImportUnavailable")
        expect(yield* Effect.promise(() => runs())).toEqual([])
        expect((yield* Effect.promise(() => uploads()))[0]?.runId).toBeNull()
      })
  )

  it.effect(
    "se la coda rifiuta il task, l'errore torna all'admin, l'import è fallito e le righe sono cancellate",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(admin.id, twoRows)
        const refusing = Layer.succeed(ImportQueue, {
          available: true,
          enqueue: () =>
            Effect.fail(
              new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
            ),
        })

        const exit = yield* run(
          startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
          { queue: refusing }
        )

        expect(failureTag(exit)).toBe("ImportQueueFailed")
        expect(yield* Effect.promise(() => runs())).toEqual([
          expect.objectContaining({
            status: "failed",
            failureReason: "La coda dell'import non ha accettato l'import",
            finishedAt: START,
          }),
        ])
        expect(yield* Effect.promise(() => uploads())).toEqual([])
        expect(
          yield* Effect.promise(() => testDb.select().from(importUploadPart))
        ).toEqual([])
      })
  )

  it.effect(
    "un import in corso da più di 30 minuti, che nessuno sta eseguendo, diventa interrotto e un nuovo import parte (AC30, D8)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const stale = yield* uploadOf(admin.id, twoRows)
        const fresh = yield* uploadOf(admin.id, twoRows)
        const { runId: staleRun } = value(
          yield* run(
            startImport({
              uploadId: stale,
              expected: [2, 3],
              startedBy: admin.id,
            })
          )
        )

        const exit = yield* run(
          startImport({
            uploadId: fresh,
            expected: [2, 3],
            startedBy: admin.id,
          }),
          { at: new Date(START.getTime() + 31 * 60_000) }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(
          (yield* Effect.promise(() => runs())).map(({ id, status }) => [
            id,
            status,
          ])
        ).toEqual([
          [staleRun, "interrupted"],
          [staleRun + 1, "running"],
        ])
        expect((yield* Effect.promise(() => runs()))[0]?.failureReason).toBe(
          "L'import non è finito entro 30 minuti dall'inizio"
        )
        expect(
          (yield* Effect.promise(() => uploads())).map(({ id }) => id)
        ).toEqual([fresh])
      })
  )
})

describe("esecuzione dalla coda", () => {
  const started = (rows: Cells[] = twoRows, expected = [2, 3]) =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const uploadId = yield* uploadOf(admin.id, rows)
      const { runId } = value(
        yield* run(startImport({ uploadId, expected, startedBy: admin.id }))
      )
      return { runId, uploadId }
    })

  it.effect(
    "scrive le righe, salva i numeri e cancella le righe temporanee nella stessa transazione (D9)",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        const finish = new Date(START.getTime() + 5_000)

        const outcome = value(yield* run(executeImport(runId), { at: finish }))

        expect(outcome).toBe("completed")
        expect(yield* Effect.promise(() => runs())).toEqual([
          expect.objectContaining({
            status: "completed",
            claimedAt: finish,
            finishedAt: finish,
            failureReason: null,
            rowsTotal: 2,
            rowsDiscarded: 0,
            customersCreated: 2,
            customersUpdated: 0,
            practicesCreated: 2,
            practicesUpdated: 0,
            linksCreated: 2,
          }),
        ])
        expect(yield* Effect.promise(() => customerCodes())).toEqual(["1", "2"])
        expect(yield* Effect.promise(() => uploads())).toEqual([])
        expect(
          yield* Effect.promise(() => testDb.select().from(importUploadPart))
        ).toEqual([])
      })
  )

  it.effect(
    "clienti e pratiche salvano il nome del file come l'import di oggi, lo storico quello del file (AC32)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(
          admin.id,
          twoRows,
          "Pratiche-ottobre.xlsx"
        )
        const { runId } = value(
          yield* run(
            startImport({ uploadId, expected: [2, 3], startedBy: admin.id })
          )
        )

        value(yield* run(executeImport(runId)))

        // October 2026 in Rome
        const stored = "1026_Pratiche_ottobre.xlsx"
        expect(
          yield* Effect.promise(() =>
            testDb.select({ fileName: customers.fileName }).from(customers)
          )
        ).toEqual([{ fileName: stored }, { fileName: stored }])
        expect(
          yield* Effect.promise(() =>
            testDb.select({ fileName: practices.fileName }).from(practices)
          )
        ).toEqual([{ fileName: stored }, { fileName: stored }])
        expect(yield* Effect.promise(() => runs())).toMatchObject([
          { fileName: "Pratiche-ottobre.xlsx" },
        ])
      })
  )

  it.effect(
    "un task consegnato due volte: la seconda volta non fa nulla (D7)",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        value(yield* run(executeImport(runId)))
        const before = yield* Effect.promise(() => runs())

        const again = value(yield* run(executeImport(runId)))

        expect(again).toBe("skipped")
        expect(yield* Effect.promise(() => runs())).toEqual(before)
        expect(yield* Effect.promise(() => customerCodes())).toEqual(["1", "2"])
      })
  )

  it.effect(
    "un task arrivato quando l'import è già preso non lo rifà, anche se è ancora in corso",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        yield* Effect.promise(() =>
          testDb
            .update(importRun)
            .set({ claimedAt: START })
            .where(eq(importRun.id, runId))
        )

        const outcome = value(yield* run(executeImport(runId)))

        expect(outcome).toBe("skipped")
        expect((yield* Effect.promise(() => runs()))[0]?.status).toBe("running")
        expect(yield* Effect.promise(() => customerCodes())).toEqual([])
      })
  )

  it.effect(
    "oltre la scadenza l'import è interrotto e non scrive nulla (AC30, D8)",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()

        const outcome = value(
          yield* run(executeImport(runId), {
            at: new Date(START.getTime() + 2_000),
            settings: { ...importSettings, timeoutMs: 1_000 },
          })
        )

        expect(outcome).toBe("interrupted")
        expect(yield* Effect.promise(() => runs())).toEqual([
          expect.objectContaining({
            status: "interrupted",
            failureReason: "L'import non è finito entro 30 minuti dall'inizio",
            customersCreated: null,
          }),
        ])
        expect(yield* Effect.promise(() => customerCodes())).toEqual([])
        expect(yield* Effect.promise(() => uploads())).toEqual([])
      })
  )

  it.effect(
    "una query fermata dal database per il tempo (57014) interrompe l'import",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        yield* Effect.promise(() =>
          failNextInsertInto(practices, {}, { sqlstate: "57014" })
        )

        const outcome = value(yield* run(executeImport(runId)))

        expect(outcome).toBe("interrupted")
        expect(yield* Effect.promise(() => customerCodes())).toEqual([])
      })
  )

  it.effect(
    "una riga che il CRM non accetta più fa fallire l'import: il motivo nomina riga e regola, mai i valori (AC19b, AC29, AC31)",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        yield* Effect.promise(() =>
          createCustomer({ id: "altro", tempID: "2", fiscalCode: CF_C })
        )

        const outcome = value(yield* run(executeImport(runId)))

        expect(outcome).toBe("failed")
        const [failed] = yield* Effect.promise(() => runs())
        expect(failed).toMatchObject({
          status: "failed",
          failureReason: "Riga 3: Codice cliente già usato da un altro cliente",
          customersCreated: null,
        })
        for (const value of [CF_A, CF_B, CF_C, "P1", "P2"]) {
          expect(failed?.failureReason).not.toContain(value)
        }
        expect(yield* Effect.promise(() => customerCodes())).toEqual(["2"])
        expect(yield* Effect.promise(() => uploads())).toEqual([])
      })
  )

  it.effect(
    "un errore del database fa fallire l'import con il suo codice e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { runId } = yield* started()
        yield* Effect.promise(() => failNextInsertInto(practices))

        const outcome = value(yield* run(executeImport(runId)))

        expect(outcome).toBe("failed")
        expect((yield* Effect.promise(() => runs()))[0]?.failureReason).toBe(
          "Errore del database (codice P0001)"
        )
        expect(yield* Effect.promise(() => customerCodes())).toEqual([])
        expect(yield* Effect.promise(() => uploads())).toEqual([])
      })
  )
})

describe("coda in processo (sviluppo, D13)", () => {
  it.live(
    "startImport risponde prima della fine e l'esito arriva nello storico (AC20)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const uploadId = yield* uploadOf(admin.id, twoRows, FILE_NAME, null)
        const inProcess = importQueueInProcess({
          run: (runId) =>
            executeImport(runId).pipe(Effect.orDie, Effect.asVoid),
          purge: () => Effect.void,
        }).pipe(
          Layer.provide(
            Layer.merge(DbLive, Layer.succeed(ImportConfig, importSettings))
          )
        )

        const { runId } = value(
          yield* run(
            startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
            // The fiber of the task runs on the real clock
            { queue: inProcess, at: null }
          )
        )

        expect((yield* Effect.promise(() => runs()))[0]?.status).toBe("running")
        yield* Effect.promise(() =>
          vi.waitFor(async () =>
            expect((await runs())[0]).toMatchObject({
              id: runId,
              status: "completed",
              customersCreated: 2,
            })
          )
        )
      })
  )
})
