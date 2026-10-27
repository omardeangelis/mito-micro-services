import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import { Clock, Effect, Exit, Layer } from "effect"
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

const at = (time: Date): Clock.Clock => ({
  [Clock.ClockTypeId]: Clock.ClockTypeId,
  unsafeCurrentTimeMillis: () => time.getTime(),
  currentTimeMillis: Effect.sync(() => time.getTime()),
  unsafeCurrentTimeNanos: () => BigInt(time.getTime()) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => BigInt(time.getTime()) * 1_000_000n),
  sleep: () => Effect.void,
})

const read = async <A, E>(program: Effect.Effect<A, E, Db | ImportConfig>) => {
  const exit = await Effect.runPromiseExit(
    program.pipe(
      Effect.withClock(at(NOW)),
      Effect.provide(
        Layer.merge(DbLive, Layer.succeed(ImportConfig, importSettings))
      )
    )
  )
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
  return exit.value
}

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
  test("una riga 'running' iniziata 31 minuti fa compare in listImports come interrotta", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await insertRun({
      startedBy: admin.id,
      startedAt: minutesAgo(31),
      status: "running",
    })

    const { imports } = await read(listImports(1))

    expect(imports).toEqual([
      expect.objectContaining({
        status: "interrupted",
        failureReason: "L'import non è finito entro 30 minuti dall'inizio",
        durationMs: null,
      }),
    ])
  })

  test("una riga 'running' di 5 minuti fa è in corso", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await insertRun({
      startedBy: admin.id,
      startedAt: minutesAgo(5),
      status: "running",
    })

    const { imports } = await read(listImports(1))

    expect(imports[0]).toMatchObject({ status: "running", durationMs: null })
  })

  test("un import completato: admin, file, formato, durata e numeri del riepilogo (AC28)", async () => {
    const anna = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Rossi",
    })
    const run = await insertRun({
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

    const { imports, total } = await read(listImports(1))

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

  test("dal più recente, 20 per pagina, con il totale", async () => {
    const admin = await createUser({ role: "ADMIN" })
    for (let minutes = 50; minutes > 0; minutes--) {
      await insertRun({
        startedBy: admin.id,
        startedAt: minutesAgo(minutes + 40),
        finishedAt: minutesAgo(minutes + 39),
        status: "completed",
        fileName: `file-${minutes}.xlsx`,
      })
    }

    const first = await read(listImports(1))
    const third = await read(listImports(3))

    expect(HISTORY_PAGE_SIZE).toBe(20)
    expect(first.total).toBe(50)
    expect(first.imports.map(({ fileName }) => fileName).slice(0, 2)).toEqual([
      "file-1.xlsx",
      "file-2.xlsx",
    ])
    expect(first.imports).toHaveLength(20)
    expect(third.imports.map(({ fileName }) => fileName)).toEqual(
      Array.from({ length: 10 }, (_, index) => `file-${index + 41}.xlsx`)
    )
  })

  test("lo storico non ha i dati delle righe: solo le colonne di AC28 (AC31)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await insertRun({
      startedBy: admin.id,
      status: "failed",
      failureReason: "Riga 3: Codice cliente già usato da un altro cliente",
    })

    const { imports } = await read(listImports(1))

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
})

describe("import dell'admin per l'avviso di fine (D15)", () => {
  test("l'ultimo import dell'admin, anche finito; nessuno se non ne ha", async () => {
    const [anna, luca] = [
      await createUser({ role: "ADMIN" }),
      await createUser({ role: "ADMIN" }),
    ]
    await insertRun({
      startedBy: anna.id,
      startedAt: minutesAgo(20),
      finishedAt: minutesAgo(19),
      status: "completed",
    })
    const latest = await insertRun({
      startedBy: anna.id,
      startedAt: minutesAgo(2),
      status: "running",
    })

    expect(await read(activeImport(anna.id))).toMatchObject({
      id: latest.id,
      status: "running",
    })
    expect(await read(activeImport(luca.id))).toBeNull()
  })

  test("un import dell'admin rimasto 'running' oltre la scadenza si legge interrotto", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await insertRun({
      startedBy: admin.id,
      startedAt: minutesAgo(45),
      status: "running",
    })

    expect(await read(activeImport(admin.id))).toMatchObject({
      status: "interrupted",
    })
  })
})
