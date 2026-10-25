import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { practices } from "@mito/db/schema/pratiche"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgDb, resetDb } from "@/test/pg"

// Le letture di `pratiche` su postgres-js, come in produzione. PGlite esegue
// la `selectDistinct` delle regioni con un sort, quindi le dà in ordine anche
// senza `ORDER BY`; Postgres, con le statistiche, sceglie un hash e non le
// ordina

describe.skipIf(!hasTestDatabase)("letture di pratiche su postgres-js", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("`getAllAvailableRegion` restituisce le regioni distinte in ordine alfabetico, null per ultima", async () => {
    const chiamante = await createOperator()
    const customer = await createCustomer()
    for (const region of ["B", null, "A", "A", "D", "C", null, "B"]) {
      await createPractice({ customerId: customer.id, region })
    }
    // Le statistiche fanno scegliere a Postgres l'aggregazione con l'hash
    await pgDb.execute(sql`ANALYZE ${practices}`)

    const result =
      await createTestCaller(chiamante).pratiche.getAllAvailableRegion()

    expect(result).toEqual([
      { region: "A" },
      { region: "B" },
      { region: "C" },
      { region: "D" },
      { region: null },
    ])
  })
})
