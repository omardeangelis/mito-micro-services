import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AnalysisQuery } from "@mito/contract/analytics"

/** The query as the backend decodes it, or null when it doesn't pass. */
const decoded = (input: unknown) => {
  const exit = Schema.decodeUnknownExit(AnalysisQuery)(input)
  return Exit.isSuccess(exit) ? exit.value : null
}

describe("AnalysisQuery", () => {
  it("accepts two days and a comparison", () => {
    expect(
      decoded({ from: "2026-10-01", to: "2026-10-30", compare: "previous" })
    ).toEqual({ from: "2026-10-01", to: "2026-10-30", compare: "previous" })
    expect(
      decoded({ from: "2026-10-01", to: "2026-10-30", compare: "last-year" })
    ).not.toBeNull()
    expect(
      decoded({ from: "2026-10-01", to: "2026-10-30", compare: "none" })
    ).not.toBeNull()
  })

  it("refuses a comparison it doesn't know", () => {
    expect(
      decoded({ from: "2026-10-01", to: "2026-10-30", compare: "foo" })
    ).toBeNull()
  })

  it("refuses a day that isn't YYYY-MM-DD", () => {
    expect(
      decoded({ from: "1/10/2026", to: "2026-10-30", compare: "previous" })
    ).toBeNull()
    expect(
      decoded({ from: "2026-10-01", to: "2026-10-3", compare: "previous" })
    ).toBeNull()
  })
})
