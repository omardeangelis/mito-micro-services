import { describe, expect, it } from "vitest"
import { bandOf, bandRange, bandValue, priorityBands } from "../priority"

describe("bandOf", () => {
  it.each([
    [0, "low"],
    [20, "low"],
    [21, "medium"],
    [60, "medium"],
    [61, "high"],
    [100, "high"],
    [101, "urgent"],
    [120, "urgent"],
    [150, "urgent"],
  ] as const)("%i -> %s", (value, band) => {
    expect(bandOf(value)).toBe(band)
  })
})

describe("bandValue", () => {
  it("gives 20, 60, 100 and 120", () => {
    expect(priorityBands.map(bandValue)).toEqual([20, 60, 100, 120])
  })

  it("round-trips through bandOf", () => {
    for (const band of priorityBands) {
      expect(bandOf(bandValue(band))).toBe(band)
    }
  })
})

describe("bandRange", () => {
  it("gives the inclusive bounds of each band", () => {
    expect(bandRange("low")).toEqual({ min: null, max: 20 })
    expect(bandRange("medium")).toEqual({ min: 21, max: 60 })
    expect(bandRange("high")).toEqual({ min: 61, max: 100 })
    expect(bandRange("urgent")).toEqual({ min: 101, max: null })
  })

  it("contains exactly the values bandOf maps to the band at the boundaries", () => {
    const samples = [-1, 0, 20, 21, 60, 61, 100, 101, 120, 150]
    for (const band of priorityBands) {
      const { min, max } = bandRange(band)
      for (const value of samples) {
        const inRange =
          (min === null || value >= min) && (max === null || value <= max)
        expect(inRange).toBe(bandOf(value) === band)
      }
    }
  })
})
