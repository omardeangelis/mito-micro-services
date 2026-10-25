import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { asc, eq } from "drizzle-orm"
import { Clock, Effect, Exit, Layer } from "effect"
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

/** A clock stopped at `at`. */
const stoppedAt = (at: Date): Clock.Clock => ({
  [Clock.ClockTypeId]: Clock.ClockTypeId,
  unsafeCurrentTimeMillis: () => at.getTime(),
  currentTimeMillis: Effect.sync(() => at.getTime()),
  unsafeCurrentTimeNanos: () => BigInt(at.getTime()) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => BigInt(at.getTime()) * 1_000_000n),
  sleep: () => Effect.void,
})

const run = <A, E>(
  program: Effect.Effect<A, E, Db | ImportConfig | ImportQueue>,
  {
    at = START,
    queue = recordingQueue,
    settings = importSettings,
  }: {
    at?: Date
    queue?: Layer.Layer<ImportQueue>
    settings?: ImportSettings
  } = {}
) =>
  Effect.runPromiseExit(
    program.pipe(
      Effect.withClock(stoppedAt(at)),
      Effect.provide(
        Layer.mergeAll(DbLive, Layer.succeed(ImportConfig, settings), queue)
      )
    )
  )

const value = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) throw new Error(`failed: ${String(exit.cause)}`)
  return exit.value
}

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail"
    ? exit.cause.error
    : undefined

const numbered = (rows: Cells[]) =>
  rows.map((cells, index) => ({ row: index + 2, cells: waveCells(cells) }))

/** The rows of a Wave file, all arrived, as `import.upload` leaves them. */
const uploadOf = async (createdBy: string, rows: Cells[]) =>
  value(
    await run(
      createUpload({
        createdBy,
        fileName: FILE_NAME,
        format: "wave",
        parts: 1,
        data: gzipSync(JSON.stringify(toFileBody(waveColumns, numbered(rows)))),
      })
    )
  )

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
  test("con un import in corso, una seconda startImport fallisce con ImportAlreadyRunning: nome dell'admin del primo e ora di inizio a Roma", async () => {
    const anna = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Rossi",
    })
    const other = await createUser({ role: "ADMIN" })
    const first = await uploadOf(anna.userId, twoRows)
    const second = await uploadOf(other.id, twoRows)
    value(
      await run(
        startImport({
          uploadId: first,
          expected: [2, 3],
          startedBy: anna.userId,
        })
      )
    )

    const exit = await run(
      startImport({ uploadId: second, expected: [2, 3], startedBy: other.id }),
      { at: new Date("2026-10-25T09:20:00.000Z") }
    )

    expect(failureOf(exit)).toMatchObject({
      _tag: "ImportAlreadyRunning",
      startedBy: "Anna Rossi",
      time: "10:05",
    })
    expect(await runs()).toHaveLength(1)
    expect((await uploads()).find(({ id }) => id === second)?.runId).toBeNull()
  })

  test("un admin senza riga operatore si legge con la sua email", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const other = await createUser({ role: "ADMIN" })
    const first = await uploadOf(admin.id, twoRows)
    const second = await uploadOf(other.id, twoRows)
    value(
      await run(
        startImport({ uploadId: first, expected: [2, 3], startedBy: admin.id })
      )
    )

    const exit = await run(
      startImport({ uploadId: second, expected: [2, 3], startedBy: other.id })
    )

    expect(failureOf(exit)).toMatchObject({
      _tag: "ImportAlreadyRunning",
      startedBy: admin.email,
    })
  })

  test("il doppio clic sulla conferma: la seconda startImport dello stesso upload fallisce con ImportAlreadyRunning", async () => {
    const admin = await createOperator({ role: "ADMIN", name: "Anna" })
    const uploadId = await uploadOf(admin.userId, twoRows)
    const start = startImport({
      uploadId,
      expected: [2, 3],
      startedBy: admin.userId,
    })
    value(await run(start))

    const exit = await run(start)

    expect(failureTag(exit)).toBe("ImportAlreadyRunning")
    expect(await runs()).toHaveLength(1)
    expect(tasks).toHaveLength(1)
  })

  test("salva l'import in corso con i numeri dell'anteprima, collega le righe e mette il task in coda", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, [...twoRows, discardedRow])

    const { runId } = value(
      await run(
        startImport({ uploadId, expected: [3, 2], startedBy: admin.id })
      )
    )

    expect(await runs()).toEqual([
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
    expect(await uploads()).toEqual([
      expect.objectContaining({ id: uploadId, runId, expected: [2, 3] }),
    ])
    expect(tasks).toEqual([{ kind: "run", runId }])
  })

  test("le righe attese devono esserci e potersi importare: altrimenti nulla parte", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, [...twoRows, discardedRow])
    const start = (expected: number[]) =>
      run(startImport({ uploadId, expected, startedBy: admin.id }))

    const absent = await start([2, 9])
    const discarded = await start([2, 4])
    const none = await start([])

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
    expect(await runs()).toEqual([])
    expect(tasks).toEqual([])
  })

  test("l'upload di un altro admin non si avvia", async () => {
    const [owner, other] = [
      await createUser({ role: "ADMIN" }),
      await createUser({ role: "ADMIN" }),
    ]
    const uploadId = await uploadOf(owner.id, twoRows)

    const exit = await run(
      startImport({ uploadId, expected: [2, 3], startedBy: other.id })
    )

    expect(failureTag(exit)).toBe("ImportUploadMissing")
    expect(await runs()).toEqual([])
  })

  test("senza coda l'import non parte: ImportUnavailable e nulla scritto (D13)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, twoRows)

    const exit = await run(
      startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
      { queue: importQueueDisabled }
    )

    expect(failureTag(exit)).toBe("ImportUnavailable")
    expect(await runs()).toEqual([])
    expect((await uploads())[0]?.runId).toBeNull()
  })

  test("se la coda rifiuta il task, l'errore torna all'admin, l'import è fallito e le righe sono cancellate", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, twoRows)
    const refusing = Layer.succeed(ImportQueue, {
      available: true,
      enqueue: () =>
        Effect.fail(
          new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
        ),
    })

    const exit = await run(
      startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
      { queue: refusing }
    )

    expect(failureTag(exit)).toBe("ImportQueueFailed")
    expect(await runs()).toEqual([
      expect.objectContaining({
        status: "failed",
        failureReason: "La coda dell'import non ha accettato l'import",
        finishedAt: START,
      }),
    ])
    expect(await uploads()).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })

  test("un import in corso da più di 30 minuti, che nessuno sta eseguendo, diventa interrotto e un nuovo import parte (AC30, D8)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const stale = await uploadOf(admin.id, twoRows)
    const fresh = await uploadOf(admin.id, twoRows)
    const { runId: staleRun } = value(
      await run(
        startImport({ uploadId: stale, expected: [2, 3], startedBy: admin.id })
      )
    )

    const exit = await run(
      startImport({ uploadId: fresh, expected: [2, 3], startedBy: admin.id }),
      { at: new Date(START.getTime() + 31 * 60_000) }
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect((await runs()).map(({ id, status }) => [id, status])).toEqual([
      [staleRun, "interrupted"],
      [staleRun + 1, "running"],
    ])
    expect((await runs())[0]?.failureReason).toBe(
      "L'import non è finito entro 30 minuti dall'inizio"
    )
    expect((await uploads()).map(({ id }) => id)).toEqual([fresh])
  })
})

describe("esecuzione dalla coda", () => {
  const started = async (rows: Cells[] = twoRows, expected = [2, 3]) => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, rows)
    const { runId } = value(
      await run(startImport({ uploadId, expected, startedBy: admin.id }))
    )
    return { runId, uploadId }
  }

  test("scrive le righe, salva i numeri e cancella le righe temporanee nella stessa transazione (D9)", async () => {
    const { runId } = await started()
    const finish = new Date(START.getTime() + 5_000)

    const outcome = value(await run(executeImport(runId), { at: finish }))

    expect(outcome).toBe("completed")
    expect(await runs()).toEqual([
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
    expect(await customerCodes()).toEqual(["1", "2"])
    expect(await uploads()).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })

  test("un task consegnato due volte: la seconda volta non fa nulla (D7)", async () => {
    const { runId } = await started()
    value(await run(executeImport(runId)))
    const before = await runs()

    const again = value(await run(executeImport(runId)))

    expect(again).toBe("skipped")
    expect(await runs()).toEqual(before)
    expect(await customerCodes()).toEqual(["1", "2"])
  })

  test("un task arrivato quando l'import è già preso non lo rifà, anche se è ancora in corso", async () => {
    const { runId } = await started()
    await testDb
      .update(importRun)
      .set({ claimedAt: START })
      .where(eq(importRun.id, runId))

    const outcome = value(await run(executeImport(runId)))

    expect(outcome).toBe("skipped")
    expect((await runs())[0]?.status).toBe("running")
    expect(await customerCodes()).toEqual([])
  })

  test("oltre la scadenza l'import è interrotto e non scrive nulla (AC30, D8)", async () => {
    const { runId } = await started()

    const outcome = value(
      await run(executeImport(runId), {
        at: new Date(START.getTime() + 2_000),
        settings: { ...importSettings, timeoutMs: 1_000 },
      })
    )

    expect(outcome).toBe("interrupted")
    expect(await runs()).toEqual([
      expect.objectContaining({
        status: "interrupted",
        failureReason: "L'import non è finito entro 30 minuti dall'inizio",
        customersCreated: null,
      }),
    ])
    expect(await customerCodes()).toEqual([])
    expect(await uploads()).toEqual([])
  })

  test("una query fermata dal database per il tempo (57014) interrompe l'import", async () => {
    const { runId } = await started()
    await failNextInsertInto(practices, {}, { sqlstate: "57014" })

    const outcome = value(await run(executeImport(runId)))

    expect(outcome).toBe("interrupted")
    expect(await customerCodes()).toEqual([])
  })

  test("una riga che il CRM non accetta più fa fallire l'import: il motivo nomina riga e regola, mai i valori (AC19b, AC29, AC31)", async () => {
    const { runId } = await started()
    await createCustomer({ id: "altro", tempID: "2", fiscalCode: CF_C })

    const outcome = value(await run(executeImport(runId)))

    expect(outcome).toBe("failed")
    const [failed] = await runs()
    expect(failed).toMatchObject({
      status: "failed",
      failureReason: "Riga 3: Codice cliente già usato da un altro cliente",
      customersCreated: null,
    })
    for (const value of [CF_A, CF_B, CF_C, "P1", "P2"]) {
      expect(failed?.failureReason).not.toContain(value)
    }
    expect(await customerCodes()).toEqual(["2"])
    expect(await uploads()).toEqual([])
  })

  test("un errore del database fa fallire l'import con il suo codice e nulla scritto", async () => {
    const { runId } = await started()
    await failNextInsertInto(practices)

    const outcome = value(await run(executeImport(runId)))

    expect(outcome).toBe("failed")
    expect((await runs())[0]?.failureReason).toBe(
      "Errore del database (codice P0001)"
    )
    expect(await customerCodes()).toEqual([])
    expect(await uploads()).toEqual([])
  })
})

describe("coda in processo (sviluppo, D13)", () => {
  test("startImport risponde prima della fine e l'esito arriva nello storico (AC20)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(admin.id, twoRows)
    const inProcess = importQueueInProcess({
      run: (runId) => executeImport(runId).pipe(Effect.orDie, Effect.asVoid),
      purge: () => Effect.void,
    }).pipe(
      Layer.provide(
        Layer.merge(DbLive, Layer.succeed(ImportConfig, importSettings))
      )
    )

    const { runId } = value(
      await run(
        startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
        // The fiber of the task runs on the real clock
        { queue: inProcess, at: new Date() }
      )
    )

    expect((await runs())[0]?.status).toBe("running")
    await vi.waitFor(async () =>
      expect((await runs())[0]).toMatchObject({
        id: runId,
        status: "completed",
        customersCreated: 2,
      })
    )
  })
})
