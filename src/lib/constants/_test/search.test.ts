import { describe, expect, it } from "vitest"
import {
  customerSearchBy,
  parseCustomerSearchBy,
} from "@/lib/constants/customerSearch"
import { parsePraticaSearchBy } from "@/lib/constants/praticaSearch"

// Come le pagine Clienti e Pratiche leggono `search_by` dall'URL

describe("parseCustomerSearchBy", () => {
  it("tiene ogni valore del selettore", () => {
    for (const value of customerSearchBy.options) {
      expect(parseCustomerSearchBy(value)).toBe(value)
      expect(parseCustomerSearchBy([value])).toBe(value)
    }
  })

  it("assente, sconosciuto o ripetuto cerca per codice fiscale", () => {
    expect(parseCustomerSearchBy(undefined)).toBe("fiscalCode")
    expect(parseCustomerSearchBy(null)).toBe("fiscalCode")
    expect(parseCustomerSearchBy([])).toBe("fiscalCode")
    expect(parseCustomerSearchBy("")).toBe("fiscalCode")
    expect(parseCustomerSearchBy([""])).toBe("fiscalCode")
    expect(parseCustomerSearchBy("address")).toBe("fiscalCode")
    expect(parseCustomerSearchBy("__proto__")).toBe("fiscalCode")
    expect(parseCustomerSearchBy(["comune", "email"])).toBe("fiscalCode")
  })
})

describe("parsePraticaSearchBy", () => {
  it("tiene praticaId", () => {
    expect(parsePraticaSearchBy("praticaId")).toBe("praticaId")
  })

  it("assente, sconosciuto o ripetuto cerca per ID pratica", () => {
    expect(parsePraticaSearchBy(undefined)).toBe("praticaId")
    expect(parsePraticaSearchBy("")).toBe("praticaId")
    expect(parsePraticaSearchBy("region")).toBe("praticaId")
    expect(parsePraticaSearchBy(["praticaId", "region"])).toBe("praticaId")
  })
})
