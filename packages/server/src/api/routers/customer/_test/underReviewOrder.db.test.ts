import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { customers } from "@mito/db/schema/customers"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { createTestCaller } from "@/test/caller"

// I clienti in revisione sono ordinati per `updatedAt`, e a parità di data
// per id (TD8 j). Il GROUP BY per id fa arrivare le righe al sort finale già
// in ordine di id; con tante righe su poche date il sort di Postgres, che non
// è stabile, mescola i pari: senza l'id nell'`ORDER BY` il test fallisce.

// Un numero primo: il passo 37 tocca ogni posizione una volta
const CUSTOMERS = 101
const DATES = [
  new Date("2026-10-01T10:00:00.000Z"),
  new Date("2026-10-02T10:00:00.000Z"),
  new Date("2026-10-03T10:00:00.000Z"),
]

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("customer.getCustomerUnderReview con molti clienti sulle stesse date", () => {
  it("li restituisce per data e, a parità di data, per id", async () => {
    const operator = await createOperator()
    // Id a larghezza fissa in ordine sparso: l'ordine è lo stesso con
    // qualunque collation
    const rows = Array.from({ length: CUSTOMERS }, (_, row) => {
      const id = `REV${String((row * 37) % CUSTOMERS).padStart(3, "0")}`
      return { id, updatedAt: DATES[row % DATES.length]! }
    })
    await db.insert(customers).values(
      rows.map(({ id, updatedAt }) => ({
        id,
        tempID: id,
        uniqueHash: id,
        source: "inbound" as const,
        blackListStatus: "review" as const,
        updatedAt,
      }))
    )

    const result =
      await createTestCaller(operator).customer.getCustomerUnderReview()

    const expected = [...rows]
      .sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() ||
          a.id.localeCompare(b.id)
      )
      .map(({ id }) => id)
    expect(result.map((customer) => customer.id)).toEqual(expected)
  })
})
