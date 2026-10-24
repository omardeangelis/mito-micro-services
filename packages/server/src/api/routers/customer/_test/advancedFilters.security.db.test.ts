import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"

// I filtri avanzati di Clienti non eseguono SQL del chiamante (AC2, AC4, AC5,
// AC10). L'input si passa come `unknown`: un chiamante diretto della
// procedura manda quello che vuole, anche i campi che lo zod non conosce

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type Caller = ReturnType<typeof createTestCaller>
type Input = Parameters<Caller["customer"]["getAllCustomers"]>[0]

async function seed() {
  // Un OPERATORE e nessun ADMIN nel database
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const roma = await createCustomer({ comune: "Roma" })
  const milano = await createCustomer({ comune: "Milano" })
  const list = async (input: Record<string, unknown>) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 50,
      ...input,
    } as unknown as Input)
    return { ids: allCustomers.map((c) => c.id).sort(), total }
  }
  return { roma, milano, list }
}

const comune = (value: string) => ({ field: "comune", op: "eq", value })

describe("customer.getAllCustomers, sqlFilter non arriva al database (AC2, AC10)", () => {
  it("NOT EXISTS su un'altra tabella non cambia lista né totale", async () => {
    const { list } = await seed()
    const withoutFilter = await list({})
    expect(withoutFilter.total).toBe(2)

    expect(
      await list({
        sqlFilter: `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")`,
      })
    ).toEqual(withoutFilter)
  })

  it("EXISTS sugli ADMIN, con un chiamante OPERATORE e nessun ADMIN, non cambia lista né totale", async () => {
    const { list } = await seed()
    const withoutFilter = await list({})

    expect(
      await list({
        sqlFilter: `EXISTS (SELECT 1 FROM "mito-deutsche_user" WHERE role = 'ADMIN')`,
      })
    ).toEqual(withoutFilter)
  })

  it("1=1) OR (1=1 non annulla la ricerca", async () => {
    const { roma, list } = await seed()
    const search = { q: "Roma", searchBy: "comune" }
    expect(await list(search)).toEqual({ ids: [roma.id], total: 1 })

    expect(await list({ ...search, sqlFilter: "1=1) OR (1=1" })).toEqual({
      ids: [roma.id],
      total: 1,
    })
  })

  it("un sqlFilter valido di un frontend vecchio non ha effetto", async () => {
    const { list } = await seed()
    const withoutFilter = await list({})

    expect(await list({ sqlFilter: "comune ilike '%Roma%'" })).toEqual(
      withoutFilter
    )
  })
})

describe("customer.getAllCustomers, advancedFilters con campi malevoli (AC2, AC7, AC8)", () => {
  it("scarta senza errore una colonna a forma di iniezione o di proprietà di Object, e applica il filtro valido accanto", async () => {
    const { roma, list } = await seed()
    for (const field of [
      "1=1) OR (1=1",
      "comune; drop table x",
      "__proto__",
      "constructor",
      "toString",
    ]) {
      expect(
        await list({
          advancedFilters: [{ field, op: "eq", value: "x" }, comune("Rom")],
        }),
        field
      ).toEqual({ ids: [roma.id], total: 1 })
    }
  })

  it("scarta senza errore un operatore a forma di iniezione, sconosciuto o di Object, e applica il filtro valido accanto", async () => {
    const { roma, list } = await seed()
    for (const op of ["eq) OR (1=1", "in", "__proto__", "constructor"]) {
      expect(
        await list({
          advancedFilters: [
            { field: "comune", op, value: "Mil" },
            comune("Rom"),
          ],
        }),
        op
      ).toEqual({ ids: [roma.id], total: 1 })
    }
  })
})

describe("customer.getAllCustomers, valori confrontati come testo (AC2, AC4)", () => {
  it("un valore con apici, % o _ trova solo il cliente che lo contiene alla lettera", async () => {
    const { list } = await seed()
    const injection = await createCustomer({ comune: "x' OR '1'='1" })
    const apostrophe = await createCustomer({ comune: "d'angelo" })
    await createCustomer({ comune: "dangelo" })
    const percent = await createCustomer({ comune: "50%" })
    // Con % e _ come caratteri jolly li troverebbero anche questi
    await createCustomer({ comune: "5000" })
    const underscore = await createCustomer({ comune: "a_b" })
    await createCustomer({ comune: "axb" })

    for (const [value, expected] of [
      ["x' OR '1'='1", injection],
      ["d'angelo", apostrophe],
      ["50%", percent],
      ["a_b", underscore],
    ] as const) {
      expect(await list({ advancedFilters: [comune(value)] }), value).toEqual({
        ids: [expected.id],
        total: 1,
      })
    }
  })
})

describe("customer.getAllCustomers, valori solo come parametri legati (AC5)", () => {
  it("testo, numero, data ed enum stanno nei parametri della query, non nel testo SQL", async () => {
    const { list } = await seed()
    const query = vi.spyOn(testClient, "query")
    try {
      await list({
        advancedFilters: [
          comune("Zq7marker"),
          { field: "age", op: "gt", value: "4242" },
          { field: "birthday_date", op: "lt", value: "1977-03-04" },
          { field: "source", op: "eq", value: "passaparola" },
        ],
      })
      const calls = query.mock.calls.map(([text, params]) => ({
        text: String(text),
        params: (params ?? []) as unknown[],
      }))
      const filtered = calls.filter(({ params }) =>
        params.includes("%Zq7marker%")
      )
      // La pagina e il totale
      expect(filtered).toHaveLength(2)
      for (const { text, params } of filtered) {
        expect(text).not.toContain("Zq7marker")
        expect(text).not.toContain("4242")
        expect(text).not.toContain("1977-03-04")
        expect(text).not.toContain("passaparola")
        expect(params).toContain("4242")
        expect(params).toContain("1977-03-04")
        expect(params).toContain("passaparola")
      }
    } finally {
      query.mockRestore()
    }
  })
})

describe("customer.getAllCustomers, limiti dei filtri (D17)", () => {
  it("valgono le prime 20 voci, le altre si scartano", async () => {
    const { roma, list } = await seed()
    const noop = Array.from({ length: 19 }, () => comune("o"))
    // La ventesima trova Roma; la ventunesima, scartata, toglierebbe anche lei
    expect(
      await list({ advancedFilters: [...noop, comune("Rom"), comune("Mil")] })
    ).toEqual({ ids: [roma.id], total: 1 })
    // 25 voci: la stessa lista
    expect(
      await list({
        advancedFilters: [
          ...noop,
          comune("Rom"),
          ...Array.from({ length: 5 }, () => comune("Mil")),
        ],
      })
    ).toEqual({ ids: [roma.id], total: 1 })
  })

  it("un valore di 256 caratteri si scarta, uno di 255 vale", async () => {
    const { list } = await seed()
    const long = await createCustomer({ comune: "R".repeat(100) })
    const withoutFilter = await list({})

    expect(await list({ advancedFilters: [comune("R".repeat(256))] })).toEqual(
      withoutFilter
    )
    // 255 caratteri non trovano nessuno: il filtro si applica
    expect(await list({ advancedFilters: [comune("R".repeat(255))] })).toEqual({
      ids: [],
      total: 0,
    })
    expect(await list({ advancedFilters: [comune("R".repeat(100))] })).toEqual({
      ids: [long.id],
      total: 1,
    })
  })
})
