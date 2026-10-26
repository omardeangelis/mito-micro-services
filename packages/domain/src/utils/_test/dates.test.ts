import { describe, expect, it } from "vitest"
import { parseDateInput } from "../dates"

// vitest.workspace.ts runs this file in UTC and in Europe/Rome: the result is
// the same, the date a browser in Italy reads

const NOW = new Date("2025-01-15T11:00:00.000Z")
const iso = (date: Date | null) => date?.toISOString() ?? null

describe("parseDateInput", () => {
  it.each([
    // Defect kept (OQ2): Excel's 15/01/2024 is the 16th
    { input: "45306", expected: "2024-01-15T23:00:00.000Z" },
    // In summer time at 01:00 in Rome
    { input: "45488", expected: "2024-07-15T23:00:00.000Z" },
    { input: "20240115", expected: "2024-01-14T23:00:00.000Z" },
    { input: "1/15/24", expected: "2024-01-14T23:00:00.000Z" },
    { input: "1/15/2024", expected: "2024-01-14T23:00:00.000Z" },
    // Two digits after the current year: last century
    { input: "1/1/80", expected: "1979-12-31T23:00:00.000Z" },
    // Defect kept: the day first is read as the month
    { input: "15/01/2024", expected: "2025-02-28T23:00:00.000Z" },
    { input: "15Mar1959", expected: "1959-03-14T23:00:00.000Z" },
    { input: "non so", expected: null },
    { input: "2024-01-15", expected: null },
  ])("$input → $expected", ({ input, expected }) => {
    expect(iso(parseDateInput(input, NOW))).toBe(expected)
  })

  it("l'anno corrente è quello di Roma", () => {
    // 1 January 2026 at 00:30 in Rome, still 2025 in UTC
    const newYear = new Date("2025-12-31T23:30:00.000Z")

    expect(iso(parseDateInput("1/1/26", newYear))).toBe(
      "2025-12-31T23:00:00.000Z"
    )
  })
})
