import { describe, expect, it } from "vitest"
import { parseCount } from "../count"

describe("parseCount", () => {
  it.each([
    ["5", 10, 5],
    ["10", 10, 10],
    ["  7 ", 10, 7],
    ["1.500", 2000, 1500],
    ["12.345", 20000, 12345],
    ["1.234.567", 2_000_000, 1_234_567],
    ["1500", 2000, 1500],
  ])("«%s» con massimo %i è %i", (text, max, value) => {
    expect(parseCount(text, max)).toEqual({ ok: true, value })
  })

  it.each([
    "",
    "   ",
    "0",
    "-3",
    "1.5",
    "15.00",
    "1.50",
    "1.5000",
    ".500",
    "1..500",
    "1,5",
    "abc",
    "3 4",
    "0.500",
    "1.000.00",
  ])("«%s» non è valido", (text) => {
    expect(parseCount(text, 1_000_000).ok).toBe(false)
  })

  it("rifiuta oltre il massimo", () => {
    expect(parseCount("11", 10).ok).toBe(false)
    expect(parseCount("1.501", 1500).ok).toBe(false)
  })
})
