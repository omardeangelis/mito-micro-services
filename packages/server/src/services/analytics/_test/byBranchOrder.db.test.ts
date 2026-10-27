import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createCustomer, createPractice } from "@/test/factories"
import { financedByBranch } from "../financed"
import { at, DAY, T } from "./clock"

// L'ordine della ciambella lo dà la query (`ORDER BY` sul punto vendita, AC15).
// PGlite parte con `enable_seqscan = off` e raggruppa con un Sort, che
// ordina già: qui il piano è forzato su un HashAggregate, che restituisce i
// gruppi nell'ordine dell'hash, e i punti vendita sono tanti e inseriti in
// ordine sparso. Senza `ORDER BY` il test fallisce

const BRANCHES = Array.from(
  { length: 31 },
  (_, i) => `Sede ${String(i).padStart(2, "0")}`
)

beforeAll(async () => {
  await migrateUpTo()
  await testClient.exec(`SET enable_seqscan = on; SET enable_sort = off`)
})

afterAll(async () => {
  await testClient.exec(`RESET enable_seqscan; RESET enable_sort`)
})

beforeEach(async () => {
  await resetDb()
})

describe("financedByBranch: l'ordine dei punti vendita", () => {
  it("restituisce i punti vendita in ordine di nome, con quello vuoto per ultimo, qualunque sia il piano", async () => {
    const customerId = (await createCustomer()).id
    // Un passo primo rispetto a 31 visita ogni punto vendita una volta, in
    // ordine sparso
    for (let k = 0; k < BRANCHES.length; k++) {
      await createPractice({
        customerId,
        desPuntoVendita: BRANCHES[(k * 7) % BRANCHES.length],
        importoFinanziato: "1000",
        dataLiquidazione: new Date(T - 15 * DAY),
      })
    }
    await createPractice({
      customerId,
      desPuntoVendita: null,
      importoFinanziato: "1000",
      dataLiquidazione: new Date(T - 15 * DAY),
    })

    const rows = await at(T, financedByBranch({ timeFrame: "30d" }))

    expect(rows.map((row) => row.data)).toEqual([...BRANCHES, null])
  })
})
