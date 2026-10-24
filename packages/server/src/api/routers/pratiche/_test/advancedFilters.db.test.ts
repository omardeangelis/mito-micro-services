import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// I filtri avanzati di Pratiche: non eseguono SQL del chiamante (AC2, AC4,
// AC5, AC10), filtrano come oggi per ogni colonna della mappa (AC6, AC7) e
// scartano le voci non valide (AC8). Si controllano `data` e `total`, che è
// una query a parte. L'input si passa come `unknown`, come farebbe un
// chiamante diretto della procedura

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type Caller = ReturnType<typeof createTestCaller>
type Input = Parameters<Caller["pratiche"]["getAllPratiche"]>[0]
type Filter = { field: string; op: string; value: string }

const day = (value: string) => new Date(`${value}T00:00:00.000Z`)

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const customer = await createCustomer()
  const practice = (
    values: Omit<Parameters<typeof createPractice>[0], "customerId">
  ) => createPractice({ customerId: customer.id, ...values })
  const a = await practice({
    praticaId: "PR-A-001",
    importoRata: "100",
    importoFinanziato: "5000",
    importoErogato: "4800",
    importoRichiesto: "5200",
    debitoResiduo: "1000",
    rateTotali: 12,
    ratePagate: 1,
    state: "Liquidata",
    region: "Lazio",
    dataLiquidazione: day("2026-01-10"),
  })
  const b = await practice({
    praticaId: "PR-A-002",
    importoRata: "150.50",
    importoFinanziato: "10000",
    importoErogato: "9800",
    importoRichiesto: "10500",
    debitoResiduo: "2000",
    rateTotali: 24,
    ratePagate: 5,
    state: "Chiusa",
    region: "Lombardia",
    dataLiquidazione: day("2026-02-10"),
  })
  const c = await practice({
    praticaId: "PR-B-003",
    importoRata: "200.00",
    importoFinanziato: "20000",
    importoErogato: "19800",
    importoRichiesto: "21000",
    debitoResiduo: "3000",
    rateTotali: 36,
    ratePagate: 10,
    state: "Estinta anticipata",
    region: "50% Sud",
    dataLiquidazione: day("2026-03-10"),
  })
  const d = await practice({
    praticaId: "PR-B-004",
    importoRata: "300",
    importoFinanziato: "40000",
    importoErogato: "39800",
    importoRichiesto: "42000",
    debitoResiduo: "4000",
    rateTotali: 48,
    ratePagate: 20,
    state: "Stornata",
    region: "Sud",
    dataLiquidazione: day("2026-04-10"),
  })
  const list = async (input: Record<string, unknown>) => {
    const { data, total } = await caller.pratiche.getAllPratiche({
      page: 1,
      perPage: 50,
      ...input,
    } as unknown as Input)
    return {
      ids: data.map((p) => p.praticaId).sort(),
      total: total[0]?.total,
    }
  }
  const filtered = (...advancedFilters: Filter[]) => list({ advancedFilters })
  const ids = (...found: { praticaId: string }[]) => ({
    ids: found.map((p) => p.praticaId).sort(),
    total: found.length,
  })
  return { a, b, c, d, list, filtered, ids, practice }
}

const f = (field: string, op: string, value: string): Filter => ({
  field,
  op,
  value,
})

describe("pratiche.getAllPratiche, sqlFilter non arriva al database (AC2, AC10)", () => {
  it("NOT EXISTS su un'altra tabella non cambia data né total", async () => {
    const { list } = await seed()
    const withoutFilter = await list({})
    expect(withoutFilter.total).toBe(4)

    expect(
      await list({
        sqlFilter: `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")`,
      })
    ).toEqual(withoutFilter)
  })

  it("1=1) OR (1=1 non annulla la ricerca per ID pratica, in data né in total", async () => {
    const { a, b, list, ids } = await seed()
    const search = { q: "PR-A", searchBy: "praticaId" }
    expect(await list(search)).toEqual(ids(a, b))

    expect(await list({ ...search, sqlFilter: "1=1) OR (1=1" })).toEqual(
      ids(a, b)
    )
  })

  it("il payload di un frontend vecchio, sqlFilter e filter, risponde senza errore e senza effetto", async () => {
    const { list } = await seed()
    const withoutFilter = await list({})

    expect(
      await list({
        sqlFilter: "region ilike '%Lazio%' AND importo_rata > '150'",
        filter: ["region:eq:Lazio", "importo_rata:gt:150"],
      })
    ).toEqual(withoutFilter)
  })

  it("scarta senza errore colonne e operatori malevoli, e applica il filtro valido accanto", async () => {
    const { a, filtered, ids } = await seed()
    for (const invalid of [
      f("1=1) OR (1=1", "eq", "x"),
      f("__proto__", "eq", "x"),
      f("constructor", "eq", "x"),
      f("toString", "eq", "x"),
      f("importo_rata", "eq) OR (1=1", "1"),
      f("importo_rata", "constructor", "1"),
    ]) {
      expect(
        await filtered(invalid, f("region", "eq", "lazio")),
        JSON.stringify(invalid)
      ).toEqual(ids(a))
    }
  })
})

describe("pratiche.getAllPratiche, valori solo come parametri legati (AC4, AC5)", () => {
  it("region con %, _ e apici si confronta alla lettera", async () => {
    const { c, filtered, ids, practice } = await seed()
    const underscore = await practice({ praticaId: "PR-C-005", region: "a_b" })
    await practice({ praticaId: "PR-C-006", region: "axb" })
    const apostrophe = await practice({
      praticaId: "PR-C-007",
      region: "Valle d'Aosta",
    })

    // Come jolly, "%" troverebbe tutte le pratiche e "a_b" anche "axb"
    expect(await filtered(f("region", "eq", "%"))).toEqual(ids(c))
    expect(await filtered(f("region", "eq", "a_b"))).toEqual(ids(underscore))
    expect(await filtered(f("region", "eq", "d'aosta"))).toEqual(
      ids(apostrophe)
    )
  })

  it("testo, numero, data ed enum stanno nei parametri della query, non nel testo SQL", async () => {
    const { filtered } = await seed()
    const query = vi.spyOn(testClient, "query")
    try {
      await filtered(
        f("region", "eq", "Zq7marker"),
        f("importo_rata", "gt", "4242"),
        f("data_liquidazione", "lt", "1977-03-04"),
        f("state", "eq", "Estinta anticipata")
      )
      const calls = query.mock.calls.map(([text, params]) => ({
        text: String(text),
        params: (params ?? []) as unknown[],
      }))
      const withMarker = calls.filter(({ params }) =>
        params.includes("%Zq7marker%")
      )
      // Il total e la union
      expect(withMarker).toHaveLength(2)
      for (const { text, params } of withMarker) {
        expect(text).not.toContain("Zq7marker")
        expect(text).not.toContain("4242")
        expect(text).not.toContain("1977-03-04")
        expect(text).not.toContain("Estinta anticipata")
        expect(params).toContain("4242")
        expect(params).toContain("1977-03-04")
        expect(params).toContain("Estinta anticipata")
      }
    } finally {
      query.mockRestore()
    }
  })
})

describe("pratiche.getAllPratiche, un filtro valido per ogni colonna (AC6, AC7)", () => {
  it("importo_rata con i 5 operatori; = è uguaglianza esatta (D16)", async () => {
    const { a, b, c, d, filtered, ids } = await seed()
    // 200 trova 200.00
    expect(await filtered(f("importo_rata", "eq", "200"))).toEqual(ids(c))
    expect(await filtered(f("importo_rata", "eq", "150.5"))).toEqual(ids(b))
    // Senza la parte intera, come prima
    expect(await filtered(f("importo_rata", "lt", ".5"))).toEqual({
      ids: [],
      total: 0,
    })
    expect(await filtered(f("importo_rata", "eq", "150"))).toEqual({
      ids: [],
      total: 0,
    })
    expect(await filtered(f("importo_rata", "gt", "150"))).toEqual(ids(b, c, d))
    expect(await filtered(f("importo_rata", "lt", "150.5"))).toEqual(ids(a))
    expect(await filtered(f("importo_rata", "gte", "150.5"))).toEqual(
      ids(b, c, d)
    )
    expect(await filtered(f("importo_rata", "lte", "200"))).toEqual(
      ids(a, b, c)
    )
  })

  it("gli altri importi", async () => {
    const { c, d, filtered, ids } = await seed()
    expect(await filtered(f("importo_finanziato", "gte", "20000"))).toEqual(
      ids(c, d)
    )
    expect(await filtered(f("importo_erogato", "gt", "19800"))).toEqual(ids(d))
    expect(await filtered(f("importo_richiesto", "eq", "21000"))).toEqual(
      ids(c)
    )
    expect(await filtered(f("debito_residuo", "gte", "3000.00"))).toEqual(
      ids(c, d)
    )
  })

  it("rate_totali e rate_pagate", async () => {
    const { a, b, d, filtered, ids } = await seed()
    expect(await filtered(f("rate_totali", "lte", "24"))).toEqual(ids(a, b))
    expect(await filtered(f("rate_pagate", "gt", "10"))).toEqual(ids(d))
  })

  it("state è un uguale esatto", async () => {
    const { c, filtered, ids } = await seed()
    expect(await filtered(f("state", "eq", "Estinta anticipata"))).toEqual(
      ids(c)
    )
  })

  it("region cerca 'contiene', senza distinguere maiuscole", async () => {
    const { c, d, filtered, ids } = await seed()
    expect(await filtered(f("region", "eq", "SUD"))).toEqual(ids(c, d))
  })

  it("data_liquidazione con i 5 operatori", async () => {
    const { a, b, c, d, filtered, ids } = await seed()
    const value = "2026-02-10"
    expect(await filtered(f("data_liquidazione", "eq", value))).toEqual(ids(b))
    expect(await filtered(f("data_liquidazione", "gt", value))).toEqual(
      ids(c, d)
    )
    expect(await filtered(f("data_liquidazione", "lt", value))).toEqual(ids(a))
    expect(await filtered(f("data_liquidazione", "gte", value))).toEqual(
      ids(b, c, d)
    )
    expect(await filtered(f("data_liquidazione", "lte", value))).toEqual(
      ids(a, b)
    )
  })

  it("con la sessione in Europe/Rome, gte 2026-01-15 trova la pratica liquidata il 14 alle 23:30 UTC, lt no", async () => {
    const { b, c, d, filtered, ids, practice } = await seed()
    // Il 15 gennaio alle 00:30 a Roma
    const night = await practice({
      praticaId: "PR-N-001",
      dataLiquidazione: new Date("2026-01-14T23:30:00.000Z"),
    })
    await testClient.exec(`SET TIME ZONE 'Europe/Rome'`)
    try {
      expect(
        await filtered(
          f("data_liquidazione", "gte", "2026-01-15"),
          f("data_liquidazione", "lt", "2026-02-01")
        )
      ).toEqual(ids(night))
      expect(
        await filtered(
          f("data_liquidazione", "lt", "2026-01-15"),
          f("data_liquidazione", "gte", "2026-01-11")
        )
      ).toEqual({ ids: [], total: 0 })
      expect(
        await filtered(f("data_liquidazione", "gte", "2026-02-01"))
      ).toEqual(ids(b, c, d))
    } finally {
      await testClient.exec(`SET TIME ZONE 'UTC'`)
    }
  })
})

describe("pratiche.getAllPratiche, voci non valide scartate (AC8)", () => {
  // Ogni voce non valida sta accanto a un filtro valido, che si applica
  const valid = f("region", "eq", "lombardia")

  it.each([
    ["una colonna fuori mappa", f("pratica_id", "eq", "PR")],
    ["gt su un testo", f("region", "gt", "M")],
    ["gt su un enum", f("state", "gt", "Liquidata")],
    ["un valore fuori dall'enum", f("state", "eq", "chiamare")],
    ["un decimale con la virgola", f("importo_rata", "eq", "1,5")],
    ["un decimale in notazione esponenziale", f("importo_rata", "gt", "1e3")],
    ["un decimale non numerico", f("importo_rata", "gt", "abc")],
    [
      "un intero fuori dal range di integer",
      f("rate_totali", "gt", "2147483648"),
    ],
    [
      "un intero sotto il range di integer",
      f("rate_totali", "gt", "-2147483649"),
    ],
    ["un intero con i decimali", f("rate_pagate", "gt", "1.5")],
    ["una data che non esiste", f("data_liquidazione", "eq", "2026-02-30")],
    ["un testo vuoto", f("region", "eq", "")],
    // Postgres rifiuta il byte NUL in un parametro di testo
    ["un testo con un byte NUL", f("region", "eq", "Lom\u0000bardia")],
  ])("%s", async (_, invalid) => {
    const { b, filtered, ids } = await seed()
    expect(await filtered(invalid, valid)).toEqual(ids(b))
  })

  it("un testo vuoto non toglie le pratiche con la colonna NULL", async () => {
    const { a, b, c, d, practice, filtered, ids } = await seed()
    // ILIKE '%%' terrebbe tutte tranne questa
    const blank = await practice({ praticaId: "PR-C-005", region: null })
    expect(await filtered(f("region", "eq", ""))).toEqual(
      ids(a, b, c, d, blank)
    )
  })

  it("numeri e date valgono dopo il trim", async () => {
    const { b, c, d, filtered, ids } = await seed()
    expect(await filtered(f("importo_rata", "gt", " 150 "))).toEqual(
      ids(b, c, d)
    )
    expect(await filtered(f("rate_totali", "eq", " 24 "))).toEqual(ids(b))
    expect(
      await filtered(f("data_liquidazione", "eq", " 2026-02-10 "))
    ).toEqual(ids(b))
  })
})
