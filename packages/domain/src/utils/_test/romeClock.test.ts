import { describe, expect, it } from "vitest"
import { addRomeMonth, romeLocalDate, romeParseDate } from "../romeClock"

// The `utc` and `rome` projects of vitest.config.ts run this file in UTC and
// in Europe/Rome: the literal cases hold in both, the comparisons with the native Date only in Rome, where
// the native Date is what a browser in Italy gives

const iso = (date: Date) => date.toISOString()
const inRome =
  new Date("2024-01-15T12:00:00.000Z").getTimezoneOffset() === -60 &&
  new Date("2024-07-15T12:00:00.000Z").getTimezoneOffset() === -120

describe("romeLocalDate", () => {
  it("dà la mezzanotte di Roma, d'inverno e d'estate", () => {
    expect(iso(romeLocalDate(2024, 0, 15))).toBe("2024-01-14T23:00:00.000Z")
    expect(iso(romeLocalDate(2024, 6, 15))).toBe("2024-07-14T22:00:00.000Z")
  })

  it("fa scorrere i campi oltre il limite, come il costruttore", () => {
    expect(iso(romeLocalDate(2024, 14, 1))).toBe("2025-02-28T23:00:00.000Z")
  })

  it("un'ora che non esiste prende l'offset di prima del cambio, una doppia la prima volta", () => {
    expect(iso(romeLocalDate(2026, 2, 29, 2, 30))).toBe(
      "2026-03-29T01:30:00.000Z"
    )
    expect(iso(romeLocalDate(2026, 9, 25, 2, 30))).toBe(
      "2026-10-25T00:30:00.000Z"
    )
  })

  it("il 1° gennaio 1900, base dei seriali di Excel", () => {
    expect(iso(romeLocalDate(1900, 0, 1))).toBe("1899-12-31T23:00:00.000Z")
  })

  it("un campo non numerico dà una data non valida", () => {
    expect(romeLocalDate(NaN, 0, 1).getTime()).toBeNaN()
  })
})

describe("addRomeMonth", () => {
  it("stesso giorno e ora del mese dopo, anche col cambio d'ora", () => {
    const march = new Date("2024-03-14T23:00:00.000Z")
    expect(iso(addRomeMonth(march))).toBe("2024-04-14T22:00:00.000Z")
  })

  it("31 gennaio → 2 marzo nel 2024, come setMonth", () => {
    const january = new Date("2024-01-30T23:00:00.000Z")
    expect(iso(addRomeMonth(january))).toBe("2024-03-01T23:00:00.000Z")
  })

  it("non cambia la data che riceve", () => {
    const date = new Date("2024-01-14T23:00:00.000Z")
    addRomeMonth(date)
    expect(iso(date)).toBe("2024-01-14T23:00:00.000Z")
  })

  it("una data non valida resta non valida", () => {
    expect(addRomeMonth(new Date(NaN)).getTime()).toBeNaN()
  })
})

describe("romeParseDate", () => {
  it.each([
    { input: "1/15/24", expected: "2024-01-14T23:00:00.000Z" },
    { input: "01-15-2024", expected: "2024-01-14T23:00:00.000Z" },
    { input: "2024-01-15T10:00", expected: "2024-01-15T09:00:00.000Z" },
    { input: "2024-01-15 10:00", expected: "2024-01-15T09:00:00.000Z" },
    // Absolute: UTC by the spec, or with a zone
    { input: "2024-01-15", expected: "2024-01-15T00:00:00.000Z" },
    { input: "2024-01-15T10:00:00Z", expected: "2024-01-15T10:00:00.000Z" },
    {
      input: "Mon Jan 15 2024 00:00:00 GMT+0100",
      expected: "2024-01-14T23:00:00.000Z",
    },
  ])("il testo $input → $expected", ({ input, expected }) => {
    expect(iso(romeParseDate(input))).toBe(expected)
  })

  it("un numero sono millisecondi dal 1970", () => {
    expect(iso(romeParseDate(20240115))).toBe("1970-01-01T05:37:20.115Z")
  })

  it("un testo illeggibile dà una data non valida", () => {
    expect(romeParseDate("non so").getTime()).toBeNaN()
    expect(romeParseDate("15/01/2024").getTime()).toBeNaN()
  })
})

describe.runIf(inRome)("uguale al Date nativo di un processo a Roma", () => {
  const days = Array.from({ length: 800 }, (_, i) => {
    const date = new Date(Date.UTC(2023, 9, 1 + i))
    return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
  })

  it("romeLocalDate come new Date(anno, mese, giorno, ore)", () => {
    for (const [year = 0, month = 0, day = 1] of days) {
      for (const hours of [0, 1, 2, 3, 12, 23]) {
        expect(iso(romeLocalDate(year, month, day, hours, 30))).toBe(
          iso(new Date(year, month, day, hours, 30))
        )
      }
    }
    for (const year of [1900, 1916, 1944, 1959, 1966, 1980, 1999]) {
      expect(iso(romeLocalDate(year, 5, 15))).toBe(iso(new Date(year, 5, 15)))
    }
  })

  it("addRomeMonth come setMonth(getMonth() + 1)", () => {
    for (const [year = 0, month = 0, day = 1] of days) {
      for (const hours of [0, 1, 12]) {
        const native = new Date(year, month, day, hours)
        const expected = new Date(native)
        expected.setMonth(expected.getMonth() + 1)
        expect(iso(addRomeMonth(native))).toBe(iso(expected))
      }
    }
  })

  it("romeParseDate come new Date(testo)", () => {
    for (const [year = 0, month = 0, day = 1] of days) {
      const m = month + 1
      const yy = String(year).slice(-2)
      for (const text of [
        `${m}/${day}/${yy}`,
        `${m}/${day}/${year}`,
        `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ]) {
        expect(iso(romeParseDate(text))).toBe(iso(new Date(text)))
      }
    }
  })
})
