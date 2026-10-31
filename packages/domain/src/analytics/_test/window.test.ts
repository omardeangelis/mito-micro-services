import { describe, expect, it } from "vitest"
import {
  allowedGroups,
  autoGroup,
  comparisonOf,
  daysIn,
  effectiveGroup,
  initialComparison,
  presetRange,
  resolveGroup,
  validateWindow,
  widenAction,
} from "../window"

// The examples of the spec are computed on 30/10/2026
const today = "2026-10-30"

describe("presetRange (AC9)", () => {
  it.each([
    ["7d", "2026-10-24", "2026-10-30"],
    ["30d", "2026-10-01", "2026-10-30"],
    ["90d", "2026-08-02", "2026-10-30"],
    ["ytd", "2026-01-01", "2026-10-30"],
    ["12m", "2025-10-31", "2026-10-30"],
  ] as const)("%s goes from %s to %s", (preset, from, to) => {
    expect(presetRange(preset, today)).toEqual({ from, to })
  })

  it("12m on a leap day goes back to the day after the same day a year before", () => {
    expect(presetRange("12m", "2028-03-01")).toEqual({
      from: "2027-03-02",
      to: "2028-03-01",
    })
  })
})

describe("initialComparison (AC9)", () => {
  it("is the same period a year before for the current year", () => {
    expect(initialComparison("ytd")).toBe("last-year")
  })

  it.each(["7d", "30d", "90d", "12m", "custom"] as const)(
    "is the previous period for %s",
    (range) => {
      expect(initialComparison(range)).toBe("previous")
    }
  )
})

describe("comparisonOf (AC10)", () => {
  it("compares whole months with the same calendar months just before", () => {
    expect(
      comparisonOf({ from: "2026-09-01", to: "2026-09-30" }, "previous")
    ).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })

  it("compares several whole months with as many months before", () => {
    expect(
      comparisonOf({ from: "2026-01-01", to: "2026-06-30" }, "previous")
    ).toEqual({ from: "2025-07-01", to: "2025-12-31" })
  })

  it("compares any other window with as many days just before", () => {
    expect(
      comparisonOf({ from: "2026-10-01", to: "2026-10-30" }, "previous")
    ).toEqual({ from: "2026-09-01", to: "2026-09-30" })
  })

  it("compares the current year with the 303 days before it", () => {
    expect(
      comparisonOf({ from: "2026-01-01", to: "2026-10-30" }, "previous")
    ).toEqual({ from: "2025-03-04", to: "2025-12-31" })
  })

  it("compares the same dates a year before", () => {
    expect(
      comparisonOf({ from: "2026-01-01", to: "2026-10-30" }, "last-year")
    ).toEqual({ from: "2025-01-01", to: "2025-10-30" })
  })

  it("compares the same dates a year before across a leap year", () => {
    expect(
      comparisonOf({ from: "2028-03-01", to: "2028-03-10" }, "last-year")
    ).toEqual({ from: "2027-03-01", to: "2027-03-10" })
  })

  it("has no comparison with none", () => {
    expect(
      comparisonOf({ from: "2026-10-01", to: "2026-10-30" }, "none")
    ).toBeNull()
  })
})

describe("validateWindow (AC9)", () => {
  it("accepts a single day", () => {
    expect(validateWindow({ from: today, to: today }, today)).toEqual({
      from: today,
      to: today,
    })
  })

  it("accepts 366 days and refuses 367", () => {
    expect(
      validateWindow({ from: "2025-10-30", to: today }, today)
    ).not.toBeNull()
    expect(daysIn({ from: "2025-10-30", to: today })).toBe(366)
    expect(validateWindow({ from: "2025-10-29", to: today }, today)).toBeNull()
  })

  it("refuses a day after today", () => {
    expect(
      validateWindow({ from: "2026-10-01", to: "2026-10-31" }, today)
    ).toBeNull()
  })

  it("refuses inverted windows and days that don't exist", () => {
    expect(
      validateWindow({ from: "2026-10-10", to: "2026-10-09" }, today)
    ).toBeNull()
    expect(
      validateWindow({ from: "2026-02-30", to: "2026-03-01" }, today)
    ).toBeNull()
    expect(validateWindow({ from: "1/10/2026", to: today }, today)).toBeNull()
  })

  it("refuses a day that matches the pattern but isn't a date, without throwing", () => {
    expect(validateWindow({ from: "2026-13-45", to: today }, today)).toBeNull()
    expect(
      validateWindow({ from: "2026-10-01", to: "2026-13-45" }, today)
    ).toBeNull()
    expect(
      validateWindow({ from: "2026-10-01", to: today }, "2026-13-45")
    ).toBeNull()
  })

  it("refuses a year before 1000", () => {
    expect(validateWindow({ from: "0050-03-01", to: today }, today)).toBeNull()
  })
})

describe("grouping (AC13)", () => {
  it.each([
    [1, "day"],
    [14, "day"],
    [15, "week"],
    [120, "week"],
    [121, "month"],
  ] as const)("is automatic by %s days: %s", (days, group) => {
    expect(autoGroup(days)).toBe(group)
  })

  it("allows by day up to 120 days, by week from 14, by month from 60", () => {
    expect(allowedGroups(13)).toEqual(["auto", "day"])
    expect(allowedGroups(14)).toEqual(["auto", "day", "week"])
    expect(allowedGroups(59)).toEqual(["auto", "day", "week"])
    expect(allowedGroups(60)).toEqual(["auto", "day", "week", "month"])
    expect(allowedGroups(120)).toEqual(["auto", "day", "week", "month"])
    expect(allowedGroups(121)).toEqual(["auto", "week", "month"])
  })

  it("goes back to automatic when the choice is no longer allowed", () => {
    expect(effectiveGroup("month", 30)).toBe("auto")
    expect(effectiveGroup("week", 30)).toBe("week")
    expect(resolveGroup("auto", 30)).toBe("week")
    expect(resolveGroup("day", 30)).toBe("day")
  })
})

describe("widenAction (AC15)", () => {
  it.each([
    ["7d", "30d"],
    ["custom", "30d"],
    ["30d", "90d"],
    ["90d", "12m"],
    ["12m", null],
    ["ytd", null],
  ] as const)("from %s widens to %s", (range, next) => {
    expect(widenAction(range)).toBe(next)
  })
})
