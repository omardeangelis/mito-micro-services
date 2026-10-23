import { describe, expect, it } from "vitest"
import {
  exportPeriodInput,
  periodBounds,
  selectableDays,
  startsBeforeCompleteData,
} from "../period"

/** An instant given as Rome wall clock in summer (UTC+2) or winter (UTC+1). */
const rome = (iso: string, offset: "+01:00" | "+02:00") =>
  new Date(`${iso}${offset}`)

describe("selectableDays", () => {
  it("goes from the day after the one 3 months ago to today, in Rome (AC11b)", () => {
    expect(selectableDays(rome("2026-10-23T12:00:00", "+02:00"))).toEqual({
      first: "2026-07-24",
      last: "2026-10-23",
    })
  })

  it("uses the Rome day, not the UTC one, just after midnight", () => {
    // 00:30 in Rome is still the 22nd in UTC
    expect(selectableDays(rome("2026-10-23T00:30:00", "+02:00"))).toEqual({
      first: "2026-07-24",
      last: "2026-10-23",
    })
  })

  it("3 months before the 31st is the last day of a shorter month", () => {
    expect(selectableDays(rome("2026-05-31T12:00:00", "+02:00"))).toEqual({
      first: "2026-03-01",
      last: "2026-05-31",
    })
  })

  it("crosses the year", () => {
    expect(selectableDays(rome("2027-01-15T12:00:00", "+01:00"))).toEqual({
      first: "2026-10-16",
      last: "2027-01-15",
    })
  })
})

describe("periodBounds", () => {
  it("starts at midnight in Rome of the first day and ends at midnight after the last (AC11)", () => {
    expect(periodBounds({ from: "2026-10-01", to: "2026-10-02" })).toEqual({
      start: rome("2026-10-01T00:00:00", "+02:00"),
      end: rome("2026-10-03T00:00:00", "+02:00"),
    })
  })

  it("a day with the clock change lasts 25 hours", () => {
    const { start, end } = periodBounds({
      from: "2026-10-25",
      to: "2026-10-25",
    })
    expect(start).toEqual(rome("2026-10-25T00:00:00", "+02:00"))
    expect(end).toEqual(rome("2026-10-26T00:00:00", "+01:00"))
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000)
  })
})

describe("exportPeriodInput", () => {
  const now = rome("2026-10-23T12:00:00", "+02:00")
  const parse = (value: unknown) => exportPeriodInput(now).safeParse(value)

  it("takes a period inside the selectable days", () => {
    expect(parse({ from: "2026-07-24", to: "2026-10-23" }).success).toBe(true)
  })

  it.each([
    ["before the first day", { from: "2026-07-23", to: "2026-08-01" }],
    ["after today", { from: "2026-10-01", to: "2026-10-24" }],
    ["inverted", { from: "2026-10-10", to: "2026-10-01" }],
    ["not a day", { from: "2026-10-1", to: "2026-10-02" }],
    ["a day that does not exist", { from: "2026-09-31", to: "2026-10-02" }],
  ])("refuses a period %s", (_, value) => {
    expect(parse(value).success).toBe(false)
  })
})

describe("startsBeforeCompleteData", () => {
  it("is true from the 14/09/2026 back, false from the 15/09/2026 (AC11b)", () => {
    expect(
      startsBeforeCompleteData({ from: "2026-09-14", to: "2026-10-01" })
    ).toBe(true)
    expect(
      startsBeforeCompleteData({ from: "2026-09-15", to: "2026-10-01" })
    ).toBe(false)
  })
})
