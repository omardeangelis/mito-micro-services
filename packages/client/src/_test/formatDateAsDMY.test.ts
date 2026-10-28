import { describe, expect, it } from "vitest"
import { formatDateAsDMY } from "../format"

// The expected strings are written by hand: the formatter prints the Italian
// day, whatever the zone of the process (a Vercel server runs in UTC).
// A zone can't be switched from inside a vitest worker, so the zone matrix is
// run from outside: `TZ=UTC`, `TZ=America/Los_Angeles`, `TZ=Europe/Rome`.
describe("formatDateAsDMY", () => {
  it.each([
    // CEST (UTC+2): 22:00Z is already the next day in Italy
    ["2026-10-20T22:00:00Z", "21/10/2026"],
    // CET (UTC+1): 23:00Z is already the next day in Italy
    ["2026-12-31T23:00:00Z", "1/1/2027"],
    // The same instant, minutes earlier, is still the day before
    ["2026-12-31T22:59:00Z", "31/12/2026"],
    // The day the clocks go back (CEST to CET, 25/10/2026 at 01:00Z)
    ["2026-10-24T22:00:00Z", "25/10/2026"],
    ["2026-10-25T22:59:00Z", "25/10/2026"],
    ["2026-10-25T23:00:00Z", "26/10/2026"],
    // The day the clocks go forward (CET to CEST, 28/03/2027 at 01:00Z)
    ["2027-03-27T22:59:00Z", "27/3/2027"],
    ["2027-03-27T23:00:00Z", "28/3/2027"],
    // Mid-day: the same day in every zone
    ["2026-09-26T09:30:00Z", "26/9/2026"],
  ])("prints %s as the Italian day %s", (iso, expected) => {
    expect(formatDateAsDMY(new Date(iso))).toBe(expected)
  })

  it("does not pad the day or the month", () => {
    expect(formatDateAsDMY(new Date("2026-03-04T10:00:00Z"))).toBe("4/3/2026")
  })

  it("does not throw on an invalid date", () => {
    expect(() => formatDateAsDMY(new Date("not a date"))).not.toThrow()
    expect(formatDateAsDMY(new Date("not a date"))).toBe("")
  })
})
