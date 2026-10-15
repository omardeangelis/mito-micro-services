import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"
import { type CustomerSearchBy } from "@/lib/constants/customerSearch"

// La ricerca della pagina Clienti (`?q=…&search_by=…`)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const rossi = await createCustomer({
    name: "Mariangela",
    surname: "Rossignoli",
    email: "mariangela@example.com",
    phoneNumber: "3331112222",
    fiscalCode: "RSSMNG80A41H501Z",
    comune: "Civitavecchia",
  })
  const bianchi = await createCustomer({
    name: "Gianluca",
    surname: "Bianchetti",
    email: "gian_luca@example.org",
    phoneNumber: "3409998888",
    vatCode: "IT01234567890",
    comune: "Sesto San Giovanni",
  })
  const search = async (searchBy: CustomerSearchBy, q: string) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      searchBy,
      q,
    })
    return { ids: allCustomers.map((c) => c.id), total }
  }
  return { rossi, bianchi, search }
}

describe("customer.getAllCustomers, ricerca", () => {
  it("cerca per codice fiscale e per partita IVA", async () => {
    const { rossi, bianchi, search } = await seed()
    expect(await search("fiscalCode", "rssmng")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
    expect(await search("fiscalCode", "01234567")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca per nome", async () => {
    const { bianchi, search } = await seed()
    expect(await search("name", "gianl")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca per cognome", async () => {
    const { bianchi, search } = await seed()
    expect(await search("surname", "BIANCH")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca per email", async () => {
    const { rossi, search } = await seed()
    expect(await search("email", "example.com")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
  })

  it("cerca per telefono", async () => {
    const { rossi, search } = await seed()
    expect(await search("phoneNumber", "3331")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
  })

  it("cerca per comune", async () => {
    const { bianchi, search } = await seed()
    expect(await search("comune", "san giov")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca % e _ come testo, non come caratteri jolly", async () => {
    const { bianchi, search } = await seed()
    expect(await search("name", "%")).toEqual({ ids: [], total: 0 })
    expect(await search("name", "_")).toEqual({ ids: [], total: 0 })
    expect(await search("email", "n_l")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("rifiuta un search_by sconosciuto", async () => {
    const { search } = await seed()
    for (const searchBy of ["address", "nome", "telefono"]) {
      await expect(
        search(searchBy as CustomerSearchBy, "Roma")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }
  })
})
