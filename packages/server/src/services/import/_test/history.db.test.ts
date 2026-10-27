import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
import { importRun } from "@mito/db/schema/importRun"
import { type Db, DbLive } from "../../../effect/db"
import { ImportConfig, importSettings } from "../config"
import { HISTORY_PAGE_SIZE, activeImport, listImports } from "../history"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator, createUser } from "@/test/factories"

// The history of the imports (T10b, AC28–AC31): what the "Import" page lists
// and what the notice of the end of an import reads

const NOW = new Date("2026-10-25T10:00:00.000Z")
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const read = <A, E>(program: Effect.Effect<A, E, Db | ImportConfig>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    const exit = yield* program.pipe(
      Effect.provide(
        Layer.merge(DbLive, Layer.succeed(ImportConfig, importSettings))
      ),
      Effect.exit
    )
    if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
    return exit.value
  })

type Run = typeof importRun.$inferInsert

const insertRun = async (values: Partial<Run> & Pick<Run, "startedBy">) => {
  const [run] = await testDb
    .insert(importRun)
    .values({
      fileName: "0125_import.xlsx",
      format: "wave",
      rowsTotal: 10,
      rowsDiscarded: 1,
      startedAt: minutesAgo(60),
      ...values,
    })
    .returning()
  return run!
}

describe("storico degli import", () => {
  it.effect(
    "una riga 'running' iniziata 31 minuti fa compare in listImports come interrotta",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        yield* Effect.promise(() =>
          insertRun({
            startedBy: admin.id,
            startedAt: minutesAgo(31),
            status: "running",
          })
        )

        const { imports } = yield* read(listImports(1))

        expect(imports).toEqual([
          expect.objectContaining({
            status: "interrupted",
            failureReason: "L'import non è finito entro 30 minuti dall'inizio",
            durationMs: null,
          }),
        ])
      })
  )

  it.effect("una riga 'running' di 5 minuti fa è in corso", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      yield* Effect.promise(() =>
        insertRun({
          startedBy: admin.id,
          startedAt: minutesAgo(5),
          status: "running",
        })
      )

      const { imports } = yield* read(listImports(1))

      expect(imports[0]).toMatchObject({ status: "running", durationMs: null })
    })
  )

  it.effect(
    "un import completato: admin, file, formato, durata e numeri del riepilogo (AC28)",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({
            role: "ADMIN",
            name: "Anna",
            surname: "Rossi",
          })
        )
        const run = yield* Effect.promise(() =>
          insertRun({
            startedBy: anna.userId,
            startedAt: minutesAgo(10),
            finishedAt: minutesAgo(8),
            status: "completed",
            fileName: "0126_import.csv",
            format: "standard",
            rowsTotal: 120,
            rowsDiscarded: 3,
            customersCreated: 40,
            customersUpdated: 70,
            practicesCreated: 50,
            practicesUpdated: 67,
            linksCreated: 52,
          })
        )

        const { imports, total } = yield* read(listImports(1))

        expect(total).toBe(1)
        expect(imports).toEqual([
          {
            id: run.id,
            startedAt: minutesAgo(10),
            finishedAt: minutesAgo(8),
            durationMs: 2 * 60_000,
            startedBy: "Anna Rossi",
            fileName: "0126_import.csv",
            format: "standard",
            status: "completed",
            failureReason: null,
            rowsTotal: 120,
            rowsDiscarded: 3,
            customersCreated: 40,
            customersUpdated: 70,
            practicesCreated: 50,
            practicesUpdated: 67,
            linksCreated: 52,
          },
        ])
      })
  )

  it.effect("dal più recente, 20 per pagina, con il totale", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      for (let minutes = 50; minutes > 0; minutes--) {
        yield* Effect.promise(() =>
          insertRun({
            startedBy: admin.id,
            startedAt: minutesAgo(minutes + 40),
            finishedAt: minutesAgo(minutes + 39),
            status: "completed",
            fileName: `file-${minutes}.xlsx`,
          })
        )
      }

      const first = yield* read(listImports(1))
      const third = yield* read(listImports(3))

      expect(HISTORY_PAGE_SIZE).toBe(20)
      expect(first.total).toBe(50)
      expect(first.imports.map(({ fileName }) => fileName).slice(0, 2)).toEqual(
        ["file-1.xlsx", "file-2.xlsx"]
      )
      expect(first.imports).toHaveLength(20)
      expect(third.imports.map(({ fileName }) => fileName)).toEqual(
        Array.from({ length: 10 }, (_, index) => `file-${index + 41}.xlsx`)
      )
    })
  )

  it.effect(
    "lo storico non ha i dati delle righe: solo le colonne di AC28 (AC31)",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        yield* Effect.promise(() =>
          insertRun({
            startedBy: admin.id,
            status: "failed",
            failureReason:
              "Riga 3: Codice cliente già usato da un altro cliente",
          })
        )

        const { imports } = yield* read(listImports(1))

        expect(Object.keys(imports[0]!).sort()).toEqual(
          [
            "id",
            "startedAt",
            "finishedAt",
            "durationMs",
            "startedBy",
            "fileName",
            "format",
            "status",
            "failureReason",
            "rowsTotal",
            "rowsDiscarded",
            "customersCreated",
            "customersUpdated",
            "practicesCreated",
            "practicesUpdated",
            "linksCreated",
          ].sort()
        )
      })
  )
})

describe("import dell'admin per l'avviso di fine (D15)", () => {
  it.effect(
    "l'ultimo import dell'admin, anche finito; nessuno se non ne ha",
    () =>
      Effect.gen(function* () {
        const [anna, luca] = [
          yield* Effect.promise(() => createUser({ role: "ADMIN" })),
          yield* Effect.promise(() => createUser({ role: "ADMIN" })),
        ]
        yield* Effect.promise(() =>
          insertRun({
            startedBy: anna.id,
            startedAt: minutesAgo(20),
            finishedAt: minutesAgo(19),
            status: "completed",
          })
        )
        const latest = yield* Effect.promise(() =>
          insertRun({
            startedBy: anna.id,
            startedAt: minutesAgo(2),
            status: "running",
          })
        )

        expect(yield* read(activeImport(anna.id))).toMatchObject({
          id: latest.id,
          status: "running",
        })
        expect(yield* read(activeImport(luca.id))).toBeNull()
      })
  )

  it.effect(
    "un import dell'admin rimasto 'running' oltre la scadenza si legge interrotto",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        yield* Effect.promise(() =>
          insertRun({
            startedBy: admin.id,
            startedAt: minutesAgo(45),
            status: "running",
          })
        )

        expect(yield* read(activeImport(admin.id))).toMatchObject({
          status: "interrupted",
        })
      })
  )
})
