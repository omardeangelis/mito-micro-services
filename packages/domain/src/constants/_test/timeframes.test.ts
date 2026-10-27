import { describe, expect, it } from "vitest"
import {
  DEFAULTTIMEFRAME,
  parseTimeFrame,
  TIMEFRAMEOPTIONS,
} from "../timeframes"

describe("parseTimeFrame", () => {
  it.each(["30d", "90d", "365d"] as const)(
    "tiene il periodo valido %s",
    (tf) => {
      expect(parseTimeFrame(tf)).toBe(tf)
    }
  )

  it.each([
    { name: "assente", value: undefined },
    { name: "null", value: null },
    { name: "non valido", value: "7d" },
    { name: "una lista", value: ["90d"] },
  ])("con un periodo $name restituisce `30d`", ({ value }) => {
    expect(parseTimeFrame(value)).toBe("30d")
  })

  it("il periodo di default è `30d`, una delle opzioni", () => {
    expect(DEFAULTTIMEFRAME).toBe("30d")
    expect(TIMEFRAMEOPTIONS).toEqual(["30d", "90d", "365d"])
  })
})
