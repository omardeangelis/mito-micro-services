import { describe, expect, it } from "vitest"
import {
  CUSTOMER_FILTER_MAP,
  CUSTOMER_FILTER_QUERY_MAP,
  PRATICA_FILTER_MAP,
  PRATICA_FILTER_QUERY_MAP,
  filterKindOf,
  operatorsFor,
  parseFilterParam,
  parseFilterParams,
  validateAndFormatDate,
} from "../advanced"

// La lista bianca dei filtri avanzati di Clienti e Pratiche: colonne, tipi,
// operatori e lettura del parametro `filter=nome:op:valore` dell'URL

const ALL = ["eq", "gt", "lt", "gte", "lte"]

const column = (map: ReadonlyMap<string, unknown>, name: string) => {
  const found = map.get(name)
  if (!found) throw new Error(`${name} non è nella mappa`)
  return found as Parameters<typeof operatorsFor>[0]
}

describe("operatorsFor", () => {
  it("su comune solo =, su importo_rata tutti e 5, su source solo =", () => {
    expect(operatorsFor(column(CUSTOMER_FILTER_QUERY_MAP, "comune"))).toEqual([
      "eq",
    ])
    expect(
      operatorsFor(column(PRATICA_FILTER_QUERY_MAP, "importo_rata"))
    ).toEqual(ALL)
    expect(operatorsFor(column(CUSTOMER_FILTER_QUERY_MAP, "source"))).toEqual([
      "eq",
    ])
  })
})

describe("filterKindOf e operatorsFor, colonna per colonna", () => {
  const expected = {
    customers: {
      birthday_date: "date",
      age: "integer",
      source: "enum",
      comune: "text",
      sede: "text",
      phone_number: "text",
      ambito_lavorativo: "text",
      occupazione: "text",
    },
    practices: {
      data_liquidazione: "date",
      debito_residuo: "decimal",
      importo_finanziato: "decimal",
      rate_pagate: "integer",
      state: "enum",
      importo_erogato: "decimal",
      importo_richiesto: "decimal",
      rate_totali: "integer",
      region: "text",
      importo_rata: "decimal",
    },
  } as const

  it.each([
    ["customers", CUSTOMER_FILTER_QUERY_MAP],
    ["practices", PRATICA_FILTER_QUERY_MAP],
  ] as const)(
    "%s: ogni colonna ha il tipo e gli operatori attesi",
    (table, map) => {
      const kinds = expected[table] as Record<string, string>
      expect([...map.keys()].sort()).toEqual(Object.keys(kinds).sort())
      for (const [name, kind] of Object.entries(kinds)) {
        const col = column(map, name)
        expect(filterKindOf(col), name).toBe(kind)
        expect(operatorsFor(col), name).toEqual(
          kind === "enum" || kind === "text" ? ["eq"] : ALL
        )
      }
    }
  )

  it("le mappe per etichetta hanno le stesse colonne di quelle per nome", () => {
    expect([...CUSTOMER_FILTER_MAP.values()]).toEqual([
      ...CUSTOMER_FILTER_QUERY_MAP.values(),
    ])
    expect([...PRATICA_FILTER_MAP.values()]).toEqual([
      ...PRATICA_FILTER_QUERY_MAP.values(),
    ])
    expect(CUSTOMER_FILTER_MAP.get("Comune")?.name).toBe("comune")
    expect(PRATICA_FILTER_MAP.get("Rata")?.name).toBe("importo_rata")
  })

  it("__proto__, constructor e toString non sono colonne", () => {
    for (const map of [CUSTOMER_FILTER_QUERY_MAP, PRATICA_FILTER_QUERY_MAP]) {
      for (const name of ["__proto__", "constructor", "toString"]) {
        expect(map.has(name)).toBe(false)
        expect(map.get(name)).toBeUndefined()
      }
    }
  })

  it("un tipo di colonna sconosciuto non ha tipo né operatori", () => {
    const unknown = {
      ...column(CUSTOMER_FILTER_QUERY_MAP, "comune"),
      columnType: "PgJsonb",
      dataType: "json",
    } as unknown as Parameters<typeof operatorsFor>[0]
    expect(filterKindOf(unknown)).toBeUndefined()
    expect(operatorsFor(unknown)).toEqual([])
  })
})

describe("parseFilterParam", () => {
  it("legge nome, operatore e valore", () => {
    expect(parseFilterParam("comune:eq:Roma")).toEqual({
      field: "comune",
      op: "eq",
      value: "Roma",
    })
  })

  it("tiene le prime tre parti, come oggi: a:eq:10:30 dà il valore 10", () => {
    expect(parseFilterParam("a:eq:10:30")).toEqual({
      field: "a",
      op: "eq",
      value: "10",
    })
  })

  it("una tupla con una parte mancante o vuota non è un filtro", () => {
    for (const param of ["", "comune", "comune:eq", "comune:eq:", ":eq:x"]) {
      expect(parseFilterParam(param), param).toBeNull()
    }
  })

  it("non controlla colonna né operatore: lo fa il server", () => {
    expect(parseFilterParam("constructor:in:x")).toEqual({
      field: "constructor",
      op: "in",
      value: "x",
    })
  })
})

describe("parseFilterParams", () => {
  it("accetta il parametro assente, singolo o ripetuto e salta le tuple malformate", () => {
    expect(parseFilterParams(undefined)).toEqual([])
    expect(parseFilterParams("age:gt:40")).toEqual([
      { field: "age", op: "gt", value: "40" },
    ])
    expect(parseFilterParams(["age:gt:40", "rotto", "comune:eq:Roma"])).toEqual(
      [
        { field: "age", op: "gt", value: "40" },
        { field: "comune", op: "eq", value: "Roma" },
      ]
    )
  })
})

describe("validateAndFormatDate", () => {
  it("aggiunge gli zeri e rifiuta le date che non esistono", () => {
    expect(validateAndFormatDate("2026-1-5")).toBe("2026-01-05")
    expect(validateAndFormatDate("2026-02-30")).toBeNull()
    expect(validateAndFormatDate("15/01/2026")).toBeNull()
  })
})
