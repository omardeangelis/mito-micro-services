import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
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
  const importRows = async (rows: { row: number; cells: Cells }[]) => {
    const classified = classifyRows("wave", rows, NOW, FILE_NAME)
    const crm = await Effect.runPromise(
      lookupExisting(lookupKeys(groupRows(classified))).pipe(
        Effect.provide(layer)
      )
    )
    const { expected } = planRows(classified, crm)
    return () =>
      Effect.runPromiseExit(
        transaction(
          applyImport({
            format: "wave",
            fileName: FILE_NAME,
            rows,
            expected,
            now: NOW,
            deadline: Date.now() + 60_000,
          })
        ).pipe(Effect.provide(layer))
      )
  }

  // The writes on the driver of production: the parameters of the raw SQL
  // reach postgres.js as they are
  it("scrive clienti e pratiche nuovi ed esistenti", async () => {
    const a = await createCustomer({ tempID: "1", fiscalCode: CF_A })
    await createPractice({
      customerId: a.id,
      praticaId: "P1",
      ratePagate: 0,
      lastImportUpdate: new Date("2024-06-01T08:00:00.000Z"),
    })

    const exit = await (
      await importRows([
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
      ])
    )()

    expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
      customersCreated: 1,
      customersUpdated: 1,
      practicesCreated: 1,
      practicesUpdated: 1,
      linksCreated: 1,
    })
    const [p1] = await pgDb
      .select()
      .from(practices)
      .where(eq(practices.praticaId, "P1"))
    expect(p1).toMatchObject({ lastImportUpdate: NOW, fileName: FILE_NAME })
  })

  it("l'aggiornamento di un operatore su un cliente dell'import aspetta la fine dell'import e poi riesce", async () => {
    const a = await createCustomer({ tempID: "1", fiscalCode: CF_A })
    const run = await importRows([
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
    const colleague = await holdCustomerLock(a.id)
    const imported = run()
    await waitUntilBlocked(1)
    const edited = pgDb
      .update(customers)
      .set({ name: "Scritto dall'operatore" })
      .where(eq(customers.id, a.id))
      .returning({ id: customers.id })
    const editing = edited.then((rows) => rows)
    await waitUntilBlocked(2)
    await colleague.release()

    const [importExit, editedRows] = await Promise.all([imported, editing])

    expect(Exit.isSuccess(importExit)).toBe(true)
    expect(editedRows).toEqual([{ id: a.id }])
    const [after] = await pgDb
      .select()
      .from(customers)
      .where(eq(customers.id, a.id))
    expect(after).toMatchObject({
      name: "Scritto dall'operatore",
      fileName: FILE_NAME,
      source: "wave",
    })
  })
})
