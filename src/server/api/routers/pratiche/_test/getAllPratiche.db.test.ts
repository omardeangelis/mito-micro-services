import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { type PraticaSearchBy } from "@/lib/constants/praticaSearch"

// La ricerca della pagina Pratiche (`?q=…&search_by=…`)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const customer = await createCustomer()
  const cercata = await createPractice({
    customerId: customer.id,
    praticaId: "PR-2026-0451",
  })
  await createPractice({ customerId: customer.id, praticaId: "PR-2025-0910" })
  const search = async (q: string, searchBy?: PraticaSearchBy) => {
    const { data, total } = await caller.pratiche.getAllPratiche({
      page: 1,
      perPage: 10,
      searchBy,
      q,
      filter: undefined,
    })
    return { praticaIds: data.map((p) => p.praticaId), total }
  }
  return { cercata, search }
}

describe("pratiche.getAllPratiche, ricerca", () => {
  it("cerca per ID pratica", async () => {
    const { cercata, search } = await seed()
    expect(await search("2026-04", "praticaId")).toEqual({
      praticaIds: [cercata.praticaId],
      total: [{ total: 1 }],
    })
  })

  it("senza search_by cerca per ID pratica", async () => {
    const { cercata, search } = await seed()
    expect(await search("pr-2026")).toEqual({
      praticaIds: [cercata.praticaId],
      total: [{ total: 1 }],
    })
  })

  it("rifiuta un search_by sconosciuto", async () => {
    const { search } = await seed()
    await expect(
      search("Roma", "region" as PraticaSearchBy)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})
