import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { type Cells, classifyRows } from "@mito/domain/import/classify"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { planRows } from "@mito/domain/import/plan"
import { waveCells } from "@mito/domain/import/_test/cells"
import { DbLive, transaction } from "../../../effect/db"
import { applyImport } from "../apply"
import { ImportConfigLive } from "../config"
import { lookupExisting } from "../lookup"
import { createCustomer, createPractice } from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The import against the other writers of a customer, on a real Postgres
// (PGlite has one connection): a write on a customer the import holds waits
// for the end of the import and then succeeds (AC27)

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"
const CF_A = "RSSMRA80A01H501U"

describe.skipIf(!hasTestDatabase)("import e scritture concorrenti", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  const layer = Layer.merge(DbLive, ImportConfigLive)

  /** The import of the Wave rows, confirmed as the preview gives them. */
  const importRows = (rows: { row: number; cells: Cells }[]) =>
    Effect.gen(function* () {
      const classified = classifyRows("wave", rows, NOW, FILE_NAME)
      const crm = yield* lookupExisting(lookupKeys(groupRows(classified))).pipe(
        Effect.provide(layer)
      )
      const { expected } = planRows(classified, crm)
      return () =>
        Effect.gen(function* () {
          // The deadline is on the wall clock, the statements' timeout comes from it
          yield* TestClock.setTime(Date.now())
          return yield* transaction(
            applyImport({
              format: "wave",
              fileName: FILE_NAME,
              rows,
              expected,
              now: NOW,
              deadline: Date.now() + 60_000,
            })
          ).pipe(Effect.provide(layer), Effect.exit)
        })
    })

  // The writes on the driver of production: the parameters of the raw SQL
  // reach postgres.js as they are
  it.effect("scrive clienti e pratiche nuovi ed esistenti", () =>
    Effect.gen(function* () {
      const a = yield* Effect.promise(() =>
        createCustomer({ tempID: "1", fiscalCode: CF_A })
      )
      yield* Effect.promise(() =>
        createPractice({
          customerId: a.id,
          praticaId: "P1",
          ratePagate: 0,
          lastImportUpdate: new Date("2024-06-01T08:00:00.000Z"),
        })
      )

      const exit = yield* (yield* importRows([
        {
          row: 2,
          cells: waveCells({
            "Codice Fiscale": CF_A,
            "Codice NDG": "1",
            "n° Pratica": "P1",
          }),
        },
        {
          row: 3,
          cells: waveCells({
            "Codice Fiscale": "VRDLGU75B02F205X",
            "Codice NDG": "2",
            "n° Pratica": "P2",
          }),
        },
      ]))()

      expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
        customersCreated: 1,
        customersUpdated: 1,
        practicesCreated: 1,
        practicesUpdated: 1,
        linksCreated: 1,
      })
      const [p1] = yield* Effect.promise(() =>
        pgDb.select().from(practices).where(eq(practices.praticaId, "P1"))
      )
      expect(p1).toMatchObject({ lastImportUpdate: NOW, fileName: FILE_NAME })
    })
  )

  it.effect(
    "l'aggiornamento di un operatore su un cliente dell'import aspetta la fine dell'import e poi riesce",
    () =>
      Effect.gen(function* () {
        const a = yield* Effect.promise(() =>
          createCustomer({ tempID: "1", fiscalCode: CF_A })
        )
        const run = yield* importRows([
          {
            row: 2,
            cells: waveCells({
              "Codice Fiscale": CF_A,
              "Codice NDG": "1",
              Nome: "MARIO",
            }),
          },
        ])

        // The import queues behind a lock of the test, then the operator's
        // update behind the import
        const colleague = yield* Effect.promise(() => holdCustomerLock(a.id))
        const imported = yield* Effect.forkChild(run())
        yield* Effect.promise(() => waitUntilBlocked(1))
        const edited = pgDb
          .update(customers)
          .set({ name: "Scritto dall'operatore" })
          .where(eq(customers.id, a.id))
          .returning({ id: customers.id })
        const editing = edited.then((rows) => rows)
        yield* Effect.promise(() => waitUntilBlocked(2))
        yield* Effect.promise(() => colleague.release())

        const [importExit, editedRows] = yield* Effect.all([
          Fiber.join(imported),
          Effect.promise(() => editing),
        ])

        expect(Exit.isSuccess(importExit)).toBe(true)
        expect(editedRows).toEqual([{ id: a.id }])
        const [after] = yield* Effect.promise(() =>
          pgDb.select().from(customers).where(eq(customers.id, a.id))
        )
        expect(after).toMatchObject({
          name: "Scritto dall'operatore",
          fileName: FILE_NAME,
          source: "wave",
        })
      })
  )
})
