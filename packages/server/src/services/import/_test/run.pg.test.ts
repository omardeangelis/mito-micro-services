import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { Cause, Clock, Effect, Exit, Layer } from "effect"
import { importRun } from "@mito/db/schema/importRun"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { fixedClock } from "../../analytics/_test/clock"
import { type Db, DbLive } from "../../../effect/db"
import { ImportConfig, importSettings } from "../config"
import { ImportQueue, type ImportTask } from "../queue"
import { executeImport, startImport } from "../run"
import { createUpload } from "../upload"
import {
  createCustomer,
  createOperator,
  createPractice,
  createUser,
} from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  holdPracticeLock,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// One import at a time across connections, on a real Postgres (D7, D8): the
// unique index on the running row, and the cleanup that leaves alone an
// import still writing

const FILE_NAME = "0125_import.xlsx"
const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"

const rows: Cells[] = [
  { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
  { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
]

describe.skipIf(!hasTestDatabase)("un import alla volta", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  let tasks: ImportTask[]

  beforeEach(async () => {
    await resetDb()
    tasks = []
  })

  const layer = () =>
    Layer.mergeAll(
      DbLive,
      Layer.succeed(ImportConfig, importSettings),
      Layer.succeed(ImportQueue, {
        available: true,
        enqueue: (task) => Effect.sync(() => void tasks.push(task)),
      })
    )

  const run = <A, E>(
    program: Effect.Effect<A, E, Db | ImportConfig | ImportQueue>,
    at?: Date
  ) => {
    const timed = at
      ? program.pipe(
          Effect.provideService(Clock.Clock, fixedClock(at.getTime()))
        )
      : program
    return Effect.runPromiseExit(timed.pipe(Effect.provide(layer())))
  }

  const uploadOf = async (createdBy: string) => {
    const exit = await run(
      createUpload({
        createdBy,
        fileName: FILE_NAME,
        format: "wave",
        parts: 1,
        data: gzipSync(
          JSON.stringify(
            toFileBody(
              waveColumns,
              rows.map((cells, index) => ({
                row: index + 2,
                cells: waveCells(cells),
              }))
            )
          )
        ),
      })
    )
    if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
    return exit.value
  }

  const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit) &&
    exit.cause.reasons.length === 1 &&
    Cause.isFailReason(exit.cause.reasons[0]!)
      ? exit.cause.reasons[0].error
      : undefined

  const statuses = async () =>
    (
      await pgDb
        .select({ status: importRun.status })
        .from(importRun)
        .orderBy(asc(importRun.id))
    ).map(({ status }) => status)

  it("un import salvato da un'altra connessione mentre questo parte: ImportAlreadyRunning con il suo admin, dall'indice unico", async () => {
    const anna = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Rossi",
    })
    const other = await createUser({ role: "ADMIN" })
    const uploadId = await uploadOf(other.id)
    // Anna's import, not committed yet: the start doesn't see it, and its
    // insert waits on the index
    const anchor = await createCustomer({ tempID: "anchor" })
    const held = await holdCustomerLock(anchor.id)
    await held.db.insert(importRun).values({
      startedAt: new Date("2026-10-25T09:05:00.000Z"),
      startedBy: anna.userId,
      fileName: FILE_NAME,
      format: "wave",
      rowsTotal: 1,
      rowsDiscarded: 0,
    })

    const started = run(
      startImport({ uploadId, expected: [2, 3], startedBy: other.id })
    )
    await waitUntilBlocked(1)
    await held.release()

    expect(failureOf(await started)).toMatchObject({
      _tag: "ImportAlreadyRunning",
      startedBy: "Anna Rossi",
      time: "10:05",
    })
    expect(await statuses()).toEqual(["running"])
    expect(tasks).toEqual([])
  })

  it("due conferme insieme di due admin: una parte, l'altra riceve ImportAlreadyRunning (AC22)", async () => {
    const [anna, luca] = [
      await createOperator({ role: "ADMIN", name: "Anna", surname: "Rossi" }),
      await createOperator({ role: "ADMIN", name: "Luca", surname: "Bianchi" }),
    ]
    const [first, second] = [
      await uploadOf(anna.userId),
      await uploadOf(luca.userId),
    ]

    const exits = await Promise.all([
      run(
        startImport({
          uploadId: first,
          expected: [2, 3],
          startedBy: anna.userId,
        })
      ),
      run(
        startImport({
          uploadId: second,
          expected: [2, 3],
          startedBy: luca.userId,
        })
      ),
    ])

    const tags = exits.map((exit) =>
      Exit.isSuccess(exit)
        ? "started"
        : (failureOf(exit) as { _tag: string })._tag
    )
    expect(tags.sort()).toEqual(["ImportAlreadyRunning", "started"])
    expect(await statuses()).toEqual(["running"])
    expect(tasks).toHaveLength(1)
  })

  it("la pulizia degli import scaduti lascia stare quello che sta scrivendo: finisce completato (D8)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const customer = await createCustomer({ tempID: "1", fiscalCode: CF_A })
    await createPractice({ customerId: customer.id, praticaId: "P1" })
    const uploadId = await uploadOf(admin.id)
    const start = new Date()
    const started = await run(
      startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
      start
    )
    if (Exit.isFailure(started)) throw new Error(String(started.cause))

    // The import waits for P1 inside its transaction, holding its row
    const p1 = await holdPracticeLock("P1")
    const executed = run(executeImport(started.value.runId))
    await waitUntilBlocked(1)
    const another = await uploadOf(admin.id)
    const late = await run(
      startImport({ uploadId: another, expected: [2, 3], startedBy: admin.id }),
      new Date(start.getTime() + 31 * 60_000)
    )
    await p1.release()

    expect(failureOf(late)).toMatchObject({ _tag: "ImportAlreadyRunning" })
    expect(await executed).toEqual(Exit.succeed("completed"))
    expect(await statuses()).toEqual(["completed"])
  })
})
