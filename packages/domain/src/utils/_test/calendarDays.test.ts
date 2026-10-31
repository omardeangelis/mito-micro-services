import { describe, expect, it } from "vitest"
import { addMonths, isDay } from "../calendarDays"

describe("isDay", () => {
  it("accepts a day that exists", () => {
    expect(isDay("2026-10-30")).toBe(true)
    expect(isDay("2028-02-29")).toBe(true)
    expect(isDay("1000-01-01")).toBe(true)
  })

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-45",
    "2026-00-10",
    "1/10/2026",
    "2026-1-1",
    "",
  ])("refuses «%s»", (day) => {
    expect(isDay(day)).toBe(false)
  })

  it.each(["0050-03-01", "0000-01-01", "0999-12-31"])(
    "refuses «%s»: a year before 1000 that Date.UTC would move",
    (day) => {
      expect(isDay(day)).toBe(false)
    }
  )

  it("is what makes addMonths safe: Date.UTC would read the year 50 as 1950", () => {
    expect(addMonths("0050-03-01", 0)).toBe("1950-03-01")
    expect(isDay("0050-03-01")).toBe(false)
  })
})
