import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { customers } from "@mito/db/schema/customers"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createOperator } from "@/test/factories"
import { createTestCaller } from "@/test/caller"

// L'ordine delle tendine (comune, sede, ambito, occupazione) lo dà solo
// l'`ORDER BY` delle query. Con pochi valori Postgres può restituirli già
// ordinati anche senza (Sort + Unique), e PGlite parte con `enable_seqscan =
// off`, che gli fa scegliere sempre quel piano. Qui il piano è forzato sul
// DISTINCT con HashAggregate, che restituisce i valori nell'ordine dell'hash,
// e i valori distinti sono tanti e in ordine sparso: senza `ORDER BY` il test
// fallisce.

// Un numero primo: ogni passo (37, 53, 71, 89) tocca ogni valore una volta
const DISTINCT_VALUES = 101

beforeAll(async () => {
  await migrateUpTo()
  // Il DISTINCT senza ORDER BY diventa un HashAggregate (il Sort costa troppo)
  await testClient.exec(`SET enable_seqscan = on; SET enable_sort = off`)
})

afterAll(async () => {
  await testClient.exec(`RESET enable_seqscan; RESET enable_sort`)
})

beforeEach(async () => {
  await resetDb()
})

// Solo maiuscole e cifre a larghezza fissa: l'ordine è lo stesso con
// qualunque collation
const valueAt = (prefix: string, step: number, row: number) =>
  `${prefix}${String((row * step) % DISTINCT_VALUES).padStart(3, "0")}`

/**
 * `DISTINCT_VALUES` valori distinti per colonna, ciascuno su due clienti, in
 * ordine sparso (un passo diverso per colonna), più un cliente con tutti i
 * campi a null.
 */
async function seedManyDistinctValues() {
  const operator = await createOperator()
  const rows = Array.from({ length: DISTINCT_VALUES * 2 }, (_, row) => ({
    id: `many-${row}`,
    tempID: `many-${row}`,
    uniqueHash: `many-${row}`,
    source: "inbound" as const,
    comune: valueAt("COMUNE", 37, row),
    sede: valueAt("SEDE", 53, row),
    ambitoLavorativo: valueAt("AMBITO", 71, row),
    occupazione: valueAt("LAVORO", 89, row),
  }))
  await db.insert(customers).values([
    ...rows,
    {
      id: "many-null",
      tempID: "many-null",
      uniqueHash: "many-null",
      source: "inbound" as const,
      comune: null,
      sede: null,
      ambitoLavorativo: null,
      occupazione: null,
    },
  ])
  return createTestCaller(operator)
}

describe.each([
  ["getAllAvailableComune", "comune", "COMUNE"],
  ["getAllAvaliableSede", "sede", "SEDE"],
  ["getAllAvailableAmbito", "ambito", "AMBITO"],
  ["getAllAvailableJobs", "job", "LAVORO"],
] as const)(
  "customer.%s con molti valori distinti",
  (procedure, key, prefix) => {
    it(`restituisce ${DISTINCT_VALUES} valori in ordine crescente e il null per ultimo, qualunque sia il piano del DISTINCT`, async () => {
      const caller = await seedManyDistinctValues()

      const expected = Array.from({ length: DISTINCT_VALUES }, (_, i) => ({
        [key]: `${prefix}${String(i).padStart(3, "0")}`,
      }))

      expect(await caller.customer[procedure]()).toEqual([
        ...expected,
        { [key]: null },
      ])
    })
  }
)
