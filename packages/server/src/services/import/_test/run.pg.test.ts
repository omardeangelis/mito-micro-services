import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { asc } from "drizzle-orm"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { importRun } from "@mito/db/schema/importRun"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { Db } from "../../../effect/db"
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
      Db.layer,
      Layer.succeed(ImportConfig, importSettings),
      Layer.succeed(ImportQueue, {
        available: true,
        enqueue: (task) => Effect.sync(() => void tasks.push(task)),
      })
    )

  const run = <A, E>(
    program: Effect.Effect<A, E, Db | ImportConfig | ImportQueue>,
    at?: Date
  ) =>
    Effect.gen(function* () {
      // Without `at`, the time of the moment: the TestClock is shared by the
      // runs of a test, so each one sets it before it starts
      yield* TestClock.setTime((at ?? new Date()).getTime())
      return yield* program.pipe(Effect.provide(layer()), Effect.exit)
    })

  const uploadOf = (createdBy: string) =>
    Effect.gen(function* () {
      const exit = yield* run(
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
    })

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

  it.effect(
    "un import salvato da un'altra connessione mentre questo parte: ImportAlreadyRunning con il suo admin, dall'indice unico",
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
        const uploadId = yield* uploadOf(other.id)
        // Anna's import, not committed yet: the start doesn't see it, and its
        // insert waits on the index
        const anchor = yield* Effect.promise(() =>
          createCustomer({ tempID: "anchor" })
        )
        const held = yield* Effect.promise(() => holdCustomerLock(anchor.id))
        yield* Effect.promise(() =>
          held.db.insert(importRun).values({
            startedAt: new Date("2026-10-25T09:05:00.000Z"),
            startedBy: anna.userId,
            fileName: FILE_NAME,
            format: "wave",
            rowsTotal: 1,
            rowsDiscarded: 0,
          })
        )

        const startedFiber = yield* Effect.forkChild(
          run(startImport({ uploadId, expected: [2, 3], startedBy: other.id }))
        )
        const started = Fiber.join(startedFiber)
        yield* Effect.promise(() => waitUntilBlocked(1))
        yield* Effect.promise(() => held.release())

        expect(failureOf(yield* started)).toMatchObject({
          _tag: "ImportAlreadyRunning",
          startedBy: "Anna Rossi",
          time: "10:05",
        })
        expect(yield* Effect.promise(() => statuses())).toEqual(["running"])
        expect(tasks).toEqual([])
      })
  )

  it.effect(
    "due conferme insieme di due admin: una parte, l'altra riceve ImportAlreadyRunning (AC22)",
    () =>
      Effect.gen(function* () {
        const [anna, luca] = [
          yield* Effect.promise(() =>
            createOperator({ role: "ADMIN", name: "Anna", surname: "Rossi" })
          ),
          yield* Effect.promise(() =>
            createOperator({ role: "ADMIN", name: "Luca", surname: "Bianchi" })
          ),
        ]
        const [first, second] = [
          yield* uploadOf(anna.userId),
          yield* uploadOf(luca.userId),
        ]

        const exits = yield* Effect.all(
          [
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
          ],
          { concurrency: "unbounded" }
        )

        const tags = exits.map((exit) =>
          Exit.isSuccess(exit)
            ? "started"
            : (failureOf(exit) as { _tag: string })._tag
        )
        expect(tags.sort()).toEqual(["ImportAlreadyRunning", "started"])
        expect(yield* Effect.promise(() => statuses())).toEqual(["running"])
        expect(tasks).toHaveLength(1)
      })
  )

  it.effect(
    "la pulizia degli import scaduti lascia stare quello che sta scrivendo: finisce completato (D8)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const customer = yield* Effect.promise(() =>
          createCustomer({ tempID: "1", fiscalCode: CF_A })
        )
        yield* Effect.promise(() =>
          createPractice({ customerId: customer.id, praticaId: "P1" })
        )
        const uploadId = yield* uploadOf(admin.id)
        const start = new Date()
        const started = yield* run(
          startImport({ uploadId, expected: [2, 3], startedBy: admin.id }),
          start
        )
        if (Exit.isFailure(started)) throw new Error(String(started.cause))

        // The import waits for P1 inside its transaction, holding its row
        const p1 = yield* Effect.promise(() => holdPracticeLock("P1"))
        const executedFiber = yield* Effect.forkChild(
          run(executeImport(started.value.runId))
        )
        const executed = Fiber.join(executedFiber)
        yield* Effect.promise(() => waitUntilBlocked(1))
        const another = yield* uploadOf(admin.id)
        const late = yield* run(
          startImport({
            uploadId: another,
            expected: [2, 3],
            startedBy: admin.id,
          }),
          new Date(start.getTime() + 31 * 60_000)
        )
        // The TestClock is shared: back to the time the running import started at
        yield* TestClock.setTime(start.getTime())
        yield* Effect.promise(() => p1.release())

        expect(failureOf(late)).toMatchObject({ _tag: "ImportAlreadyRunning" })
        expect(yield* executed).toEqual(Exit.succeed("completed"))
        expect(yield* Effect.promise(() => statuses())).toEqual(["completed"])
      })
  )
})
