import { describe, expect, it } from "vitest"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { practiceListQuery } from "../listQuery"

// The query of the practices list from the address, as the tests of
// `pratiche/page.tsx` of the Next.js app

const queryOf = (search: string | URLSearchParams) =>
  practiceListQuery(new URLSearchParams(search))

describe("practiceListQuery, search_by", () => {
  it("assente, sconosciuto o ripetuto cerca per ID pratica", () => {
    for (const search of [
      "q=PR-2026",
      "q=PR-2026&search_by=",
      "q=PR-2026&search_by=region",
      "q=PR-2026&search_by=praticaId&search_by=region",
    ]) {
      expect(queryOf(search)).toMatchObject({
        q: "PR-2026",
        searchBy: "praticaId",
      })
    }
  })

  it("con q ripetuto cerca il primo", () => {
    expect(queryOf("q=PR-2026&q=PR-2025&search_by=praticaId")).toMatchObject({
      q: "PR-2026",
      searchBy: "praticaId",
    })
  })

  it("senza q non cerca", () => {
    expect(queryOf("").q).toBeUndefined()
  })
})

// I filtri avanzati vanno al server come dati: è lui che scarta le colonne e
// gli operatori che non conosce (AC7, AC8, AC9)
describe("practiceListQuery, filtri avanzati come dati", () => {
  const filtersOf = (...filters: string[]) => {
    const params = new URLSearchParams()
    for (const filter of filters) params.append("filter", filter)
    const query = queryOf(params)
    expect(query).not.toHaveProperty("sqlFilter")
    expect(query).not.toHaveProperty("filter")
    return query.advancedFilters
  }

  it("manda la tupla dell'URL come { field, op, value }", () => {
    expect(filtersOf("importo_rata:gt:150")).toEqual([
      { field: "importo_rata", op: "gt", value: "150" },
    ])
  })

  it("manda tutte le tuple, anche quelle che il server scarta, e salta le malformate", () => {
    expect(
      filtersOf(
        "region:eq:Lazio",
        "comune:eq:x') OR ('1'='1",
        "rotto",
        "importo_rata:eq:"
      )
    ).toEqual([
      { field: "region", op: "eq", value: "Lazio" },
      { field: "comune", op: "eq", value: "x') OR ('1'='1" },
    ])
  })

  it("senza filtri avanzati manda una lista vuota", () => {
    expect(filtersOf()).toEqual([])
  })
})

describe("practiceListQuery, pagina e ordinamento", () => {
  it("senza parametri: la prima pagina, per ultima modifica, dalla meno recente", () => {
    expect(queryOf("")).toEqual({
      page: DEFAULT_PAGE,
      perPage: DEFAULT_PER_PAGE,
      filterBy: { state: undefined, productId: undefined, file: undefined },
      orderBy: "updatedAt",
      sortedBy: "asc",
      q: undefined,
      searchBy: "praticaId",
      advancedFilters: [],
    })
  })

  it("legge pagina, dimensione e ordinamento", () => {
    expect(
      queryOf("page=3&per_page=50&order_by=importoFinanziato&sorted_by=desc")
    ).toMatchObject({
      page: 3,
      perPage: 50,
      orderBy: "importoFinanziato",
      sortedBy: "desc",
    })
  })

  it.each(["abc", "1.5", "0", "-2"])(
    "una pagina %s torna alla prima, dove Next.js falliva o leggeva fuori",
    (page) => {
      expect(queryOf(`page=${page}&per_page=${page}`)).toMatchObject({
        page: DEFAULT_PAGE,
        perPage: DEFAULT_PER_PAGE,
      })
    }
  )

  it("una direzione per colonna, o sconosciuta, ordina dalla meno recente", () => {
    expect(queryOf("order_by=a,b&sorted_by=asc,desc").sortedBy).toBe("asc")
    expect(queryOf("sorted_by=up").sortedBy).toBe("asc")
  })
})

describe("practiceListQuery, filter_by", () => {
  it("legge stato, prodotto e file, una coppia codificata alla volta", () => {
    const filterBy = ["[state]=Chiusa", "[productId]=CQS-PP", "[file]=a.xlsx"]
      .map(encodeURIComponent)
      .join(",")

    expect(queryOf(`filter_by=${filterBy}`).filterBy).toEqual({
      state: "Chiusa",
      productId: "CQS-PP",
      file: "a.xlsx",
    })
  })

  it("uno stato che non esiste non filtra, dove Next.js falliva", () => {
    const filterBy = encodeURIComponent("[state]=Erogata")

    expect(queryOf(`filter_by=${filterBy}`).filterBy).toEqual({
      state: undefined,
      productId: undefined,
      file: undefined,
    })
  })
})
