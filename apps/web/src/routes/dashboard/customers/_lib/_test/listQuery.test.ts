import { describe, expect, it } from "vitest"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { customerListQuery } from "../listQuery"

// The query the customers page sends for an address: the cases of the test
// of `CustomersTableSection` of the Next.js app

/** The query of an address, its parameters as `[name, value]`, repeatable */
const queryFor = (params: [string, string][] | Record<string, string>) =>
  customerListQuery(new URLSearchParams(params))

const searchByFor = (searchBy: string[]) =>
  queryFor([
    ["q", "Roma"],
    ...searchBy.map((v): [string, string] => ["search_by", v]),
  ])

describe("customerListQuery, search_by", () => {
  it("passa un valore del selettore", () => {
    expect(searchByFor(["comune"])).toMatchObject({
      q: "Roma",
      searchBy: "comune",
    })
  })

  it("assente, sconosciuto o ripetuto cerca per codice fiscale", () => {
    for (const value of [[], [""], ["address"], ["comune", "email"]]) {
      expect(searchByFor(value)).toMatchObject({ searchBy: "fiscalCode" })
    }
  })

  it("con q ripetuto cerca il primo", () => {
    expect(
      queryFor([
        ["q", "Roma"],
        ["q", "Milano"],
        ["search_by", "comune"],
      ])
    ).toMatchObject({ q: "Roma", searchBy: "comune" })
  })

  it("senza q non cerca", () => {
    expect(queryFor({}).q).toBeUndefined()
  })
})

describe("customerListQuery, pagina e interruttori", () => {
  it("senza parametri: la prima pagina, la dimensione di default, nessun interruttore", () => {
    expect(queryFor({})).toMatchObject({
      page: DEFAULT_PAGE,
      perPage: DEFAULT_PER_PAGE,
      onlyMe: false,
      showDM: false,
    })
  })

  it("legge pagina, dimensione, only_me e black_list", () => {
    expect(
      queryFor({
        page: "3",
        per_page: "50",
        only_me: "true",
        black_list: "true",
      })
    ).toMatchObject({ page: 3, perPage: 50, onlyMe: true, showDM: true })
  })

  it("una pagina che non è un numero torna alla prima", () => {
    expect(queryFor({ page: "x", per_page: "y" })).toMatchObject({
      page: DEFAULT_PAGE,
      perPage: DEFAULT_PER_PAGE,
    })
  })
})

// Filtri avanzati come dati (AC9, AC60): le colonne e gli operatori che non
// conosce li scarta il server, la pagina non manda SQL

const sentAdvancedFilters = (filter: string[]) => {
  const query = queryFor(
    filter.map((value): [string, string] => ["filter", value])
  )
  expect(query).not.toHaveProperty("sqlFilter")
  return query.advancedFilters
}

describe("customerListQuery, filtri avanzati come dati (AC9, AC60)", () => {
  it("manda la tupla dell'URL come { field, op, value }", () => {
    expect(sentAdvancedFilters(["comune:eq:Roma"])).toEqual([
      { field: "comune", op: "eq", value: "Roma" },
    ])
  })

  it("senza filtri avanzati manda una lista vuota", () => {
    expect(sentAdvancedFilters([])).toEqual([])
  })

  it("manda anche i filtri sullo stato e su 'Contattato il', che il server scarta", () => {
    expect(
      sentAdvancedFilters([
        "state:eq:chiamare",
        "comune:eq:Roma",
        "closed_at:gte:2026-09-01",
      ])
    ).toEqual([
      { field: "state", op: "eq", value: "chiamare" },
      { field: "comune", op: "eq", value: "Roma" },
      { field: "closed_at", op: "gte", value: "2026-09-01" },
    ])
  })

  it("un nome di colonna a forma di iniezione resta un dato", () => {
    expect(
      sentAdvancedFilters([
        "1=1) OR (1:eq:x",
        "comune ilike '%' OR 1=1 --:eq:x",
        "__proto__:eq:x",
        "constructor:eq:x",
      ])
    ).toEqual([
      { field: "1=1) OR (1", op: "eq", value: "x" },
      { field: "comune ilike '%' OR 1=1 --", op: "eq", value: "x" },
      { field: "__proto__", op: "eq", value: "x" },
      { field: "constructor", op: "eq", value: "x" },
    ])
  })

  it("salta le tuple malformate e tiene le prime tre parti, come il popover", () => {
    expect(
      sentAdvancedFilters(["rotto", "comune:eq:", "age:gt:10:30"])
    ).toEqual([{ field: "age", op: "gt", value: "10" }])
  })
})

describe("customerListQuery, filter_by", () => {
  it("legge operatore, sede, ambito, occupazione e file", () => {
    expect(
      queryFor({
        filter_by:
          "[operatore]=7,[sede]=Roma-Milano,[ambito]=Privato,[jobs]=Medico-Avvocato,[file]=clienti.xlsx",
      }).filterBy
    ).toEqual({
      operatore: 7,
      sede: ["Roma", "Milano"],
      ambito: ["Privato"],
      jobs: ["Medico", "Avvocato"],
      file: "clienti.xlsx",
    })
  })

  it("l'operatore 0 è 'Non assegnato', uno che non è un numero non filtra", () => {
    expect(queryFor({ filter_by: "[operatore]=0" }).filterBy).toMatchObject({
      operatore: 0,
    })
    expect(queryFor({ filter_by: "[operatore]=x" }).filterBy?.operatore).toBe(
      undefined
    )
  })

  it("legge le coppie codificate una per una, come le scrive la pagina", () => {
    expect(
      queryFor({
        filter_by: [
          encodeURIComponent("[sede]=Roma-Milano"),
          encodeURIComponent("[file]=clienti.xlsx"),
        ].join(","),
      }).filterBy
    ).toMatchObject({ sede: ["Roma", "Milano"], file: "clienti.xlsx" })
  })
})

describe("customerListQuery, filtri tolti (AC60)", () => {
  it("non manda più il filtro per stato né quello sulle task", () => {
    for (const filterBy of [
      "[status]=chiamare",
      "[status]=chiamare-richiamare",
      encodeURIComponent("[status]=chiamare"),
    ]) {
      const query = queryFor({
        filter_by: filterBy,
        filter: "state:eq:chiamare",
      })
      expect(query.filterBy).not.toHaveProperty("status")
      expect(query).not.toHaveProperty("sqlTaskFilter")
    }
  })

  it("tiene gli altri filtri di filter_by accanto a quello tolto", () => {
    expect(
      queryFor({ filter_by: "[status]=chiamare,[sede]=Roma-Milano" })
    ).toMatchObject({ filterBy: { sede: ["Roma", "Milano"] } })
  })
})

describe("customerListQuery, ordinamenti tolti (AC59, AC60)", () => {
  const byDefault = { orderBy: "updatedAt", sortedBy: "desc" }

  it("senza ordinamento nell'URL ordina per ultima modifica, dalla più recente", () => {
    expect(queryFor({})).toMatchObject(byDefault)
  })

  it("'contattato' e 'priority' tornano al default, direzione compresa", () => {
    for (const params of [
      { order_by: "contattato", sorted_by: "asc" },
      { order_by: "contattato" },
      { order_by: "priority", sorted_by: "asc" },
      { order_by: "priority" },
    ] as Record<string, string>[]) {
      expect(queryFor(params)).toMatchObject(byDefault)
    }
  })

  it("un ordinamento a più colonne con una tolta torna al default, con le direzioni", () => {
    for (const params of [
      { order_by: "name,priority", sorted_by: "asc,desc" },
      { order_by: "contattato,name", sorted_by: "asc,asc" },
    ]) {
      expect(queryFor(params)).toMatchObject(byDefault)
    }
  })

  it("un ordinamento che esiste resta", () => {
    expect(queryFor({ order_by: "name", sorted_by: "asc" })).toMatchObject({
      orderBy: "name",
      sortedBy: "asc",
    })
    expect(queryFor({ order_by: "createdAt" })).toMatchObject({
      orderBy: "createdAt",
      sortedBy: "desc",
    })
  })
})
