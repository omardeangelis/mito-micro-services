import { describe, expect, it } from "vitest"
import {
  bucketsOf,
  formatRange,
  shiftMonths,
  sumDays,
  type Bucket,
} from "../buckets"
import type { Bucketing, Compare, DayRange } from "../window"

/** The days from `from` to `to`, both included */
const days = (from: string, to: string) => {
  const out: string[] = []
  const date = new Date(`${from}T12:00:00.000Z`)
  while (date.toISOString().slice(0, 10) <= to) {
    out.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return out
}

const buckets = (
  window: DayRange,
  group: Bucketing,
  compare: Compare,
  comparison: DayRange | null
) => bucketsOf({ window, group, compare, comparison })

const byLabel = (list: Bucket[], label: string) => {
  const bucket = list.find((b) => b.longLabel === label)
  if (!bucket)
    throw new Error(
      `No bucket «${label}» in ${list.map((b) => b.longLabel).join(", ")}`
    )
  return bucket
}

describe("shiftMonths", () => {
  it("moves to the same day of the month of arrival", () => {
    expect(shiftMonths("2026-10-30", -1)).toBe("2026-09-30")
    expect(shiftMonths("2026-03-15", -10)).toBe("2025-05-15")
  })

  it("leaves out a day the month of arrival doesn't have", () => {
    expect(shiftMonths("2026-10-31", -1)).toBeNull()
    expect(shiftMonths("2028-02-29", -12)).toBeNull()
  })
})

describe("bucketsOf (AC11)", () => {
  it("cuts weeks from Monday at the edges of the window, and says so in the name", () => {
    const list = buckets(
      { from: "2026-09-01", to: "2026-09-30" },
      "week",
      "previous",
      { from: "2026-08-01", to: "2026-08-31" }
    )
    expect(list.map((b) => b.longLabel)).toEqual([
      "1 – 6 set 2026",
      "7 – 13 set 2026",
      "14 – 20 set 2026",
      "21 – 27 set 2026",
      "28 – 30 set 2026",
    ])
    expect(list[0]).toMatchObject({ from: "2026-09-01", to: "2026-09-06" })
  })

  it("1–30 set by week against 1–31 ago moves every week by a month", () => {
    const list = buckets(
      { from: "2026-09-01", to: "2026-09-30" },
      "week",
      "previous",
      { from: "2026-08-01", to: "2026-08-31" }
    )
    expect(byLabel(list, "1 – 6 set 2026").comparisonDays).toEqual(
      days("2026-08-01", "2026-08-06")
    )
    expect(byLabel(list, "28 – 30 set 2026").comparisonDays).toEqual(
      days("2026-08-28", "2026-08-30")
    )
    // The 31st of August is in no row
    expect(list.flatMap((b) => b.comparisonDays ?? [])).not.toContain(
      "2026-08-31"
    )
  })

  it("1–31 ott by week against 1–30 set: the last week loses the 31st and isn't compared", () => {
    const list = buckets(
      { from: "2026-10-01", to: "2026-10-31" },
      "week",
      "previous",
      { from: "2026-09-01", to: "2026-09-30" }
    )
    expect(byLabel(list, "26 – 31 ott 2026").comparisonDays).toBeNull()
    expect(byLabel(list, "1 – 4 ott 2026").comparisonDays).toEqual(
      days("2026-09-01", "2026-09-04")
    )
  })

  it("gen–giu 2026 by month against lug–dic 2025: a whole month against a whole month of other length", () => {
    const list = buckets(
      { from: "2026-01-01", to: "2026-06-30" },
      "month",
      "previous",
      { from: "2025-07-01", to: "2025-12-31" }
    )
    expect(list.map((b) => b.longLabel)).toEqual([
      "gen 2026",
      "feb 2026",
      "mar 2026",
      "apr 2026",
      "mag 2026",
      "giu 2026",
    ])
    expect(byLabel(list, "mar 2026").comparisonDays).toEqual(
      days("2025-09-01", "2025-09-30")
    )
    expect(byLabel(list, "feb 2026").comparisonDays).toEqual(
      days("2025-08-01", "2025-08-31")
    )
  })

  it("the current year against the previous period moves by 10 months", () => {
    const list = buckets(
      { from: "2026-01-01", to: "2026-10-30" },
      "month",
      "previous",
      { from: "2025-03-04", to: "2025-12-31" }
    )
    // March 2025 is only 4–31 in the comparison
    expect(byLabel(list, "gen 2026").comparisonDays).toBeNull()
    expect(byLabel(list, "feb 2026").comparisonDays).toEqual(
      days("2025-04-01", "2025-04-30")
    )
    expect(byLabel(list, "1 – 30 ott 2026").comparisonDays).toEqual(
      days("2025-12-01", "2025-12-30")
    )
  })

  it("the current year by month against the year before (the opening state): each month goes back 12 months", () => {
    const list = buckets(
      { from: "2026-01-01", to: "2026-10-30" },
      "month",
      "last-year",
      { from: "2025-01-01", to: "2025-10-30" }
    )
    expect(list).toHaveLength(10)
    // The whole of January 2025
    expect(byLabel(list, "gen 2026").comparisonDays).toEqual(
      days("2025-01-01", "2025-01-31")
    )
    expect(byLabel(list, "feb 2026").comparisonDays).toEqual(
      days("2025-02-01", "2025-02-28")
    )
    // The partial month against the same days of the month a year before
    expect(byLabel(list, "1 – 30 ott 2026").comparisonDays).toEqual(
      days("2025-10-01", "2025-10-30")
    )
  })

  it("by day, a year before, the 29th of February has no day to compare with", () => {
    const list = buckets(
      { from: "2028-02-27", to: "2028-03-02" },
      "day",
      "last-year",
      { from: "2027-02-27", to: "2027-03-02" }
    )
    expect(list.map((b) => b.longLabel)).toEqual([
      "27 feb 2028",
      "28 feb 2028",
      "29 feb 2028",
      "1 mar 2028",
      "2 mar 2028",
    ])
    expect(byLabel(list, "29 feb 2028").comparisonDays).toBeNull()
    expect(byLabel(list, "1 mar 2028").comparisonDays).toEqual(["2027-03-01"])
  })

  it("1 lug – 30 set by week against 1 apr – 30 giu: 27 lug – 2 ago loses the 31st of April", () => {
    const list = buckets(
      { from: "2026-07-01", to: "2026-09-30" },
      "week",
      "previous",
      { from: "2026-04-01", to: "2026-06-30" }
    )
    expect(byLabel(list, "27 lug – 2 ago 2026").comparisonDays).toBeNull()
    expect(byLabel(list, "20 – 26 lug 2026").comparisonDays).toEqual(
      days("2026-04-20", "2026-04-26")
    )
  })

  it("moves by days when the window isn't whole months", () => {
    const list = buckets(
      { from: "2026-10-01", to: "2026-10-30" },
      "week",
      "previous",
      { from: "2026-09-01", to: "2026-09-30" }
    )
    expect(byLabel(list, "1 – 4 ott 2026").comparisonDays).toEqual(
      days("2026-09-01", "2026-09-04")
    )
    expect(byLabel(list, "26 – 30 ott 2026").comparisonDays).toEqual(
      days("2026-09-26", "2026-09-30")
    )
  })

  it("has no comparison days without a comparison", () => {
    const list = buckets(
      { from: "2026-10-01", to: "2026-10-30" },
      "week",
      "none",
      null
    )
    expect(list.every((b) => b.comparisonDays === null)).toBe(true)
  })

  it("lists the days of every bucket", () => {
    const [first] = buckets(
      { from: "2026-09-01", to: "2026-09-30" },
      "week",
      "none",
      null
    )
    expect(first?.days).toEqual(days("2026-09-01", "2026-09-06"))
  })
})

describe("formatRange", () => {
  it.each([
    [{ from: "2026-10-30", to: "2026-10-30" }, "30 ott 2026"],
    [{ from: "2026-10-01", to: "2026-10-30" }, "1 – 30 ott 2026"],
    [{ from: "2026-07-27", to: "2026-08-02" }, "27 lug – 2 ago 2026"],
    [{ from: "2025-10-31", to: "2026-10-30" }, "31 ott 2025 – 30 ott 2026"],
  ])("%o is «%s»", (range, label) => {
    expect(formatRange(range)).toBe(label)
  })
})

describe("sumDays", () => {
  it("adds the values of the days of a bucket", () => {
    const rows = [
      { day: "2026-10-01", amount: 100 },
      { day: "2026-10-03", amount: 50.5 },
      { day: "2026-10-09", amount: 7 },
    ]
    expect(
      sumDays(["2026-10-01", "2026-10-02", "2026-10-03"], rows, (r) => r.amount)
    ).toBe(150.5)
  })
})
