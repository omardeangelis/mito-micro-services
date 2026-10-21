// @vitest-environment node
import { addMonths, subMonths } from "date-fns"
import { describe, expect, it } from "vitest"
import {
  addDays,
  addMonthsDay,
  assertIsToday,
  assertSameRomeAndUtcDay,
  romeDay,
  romeMidnight,
  romeNoon,
  subMonthsDay,
} from "../day"

describe("assertSameRomeAndUtcDay", () => {
  it("stops at 00:30 in Rome on 22 October 2026, still the 21st in UTC", () => {
    expect(() =>
      assertSameRomeAndUtcDay(new Date("2026-10-21T22:30:00.000Z"))
    ).toThrow(/Europe\/Rome/)
  })

  it("passes at noon in Rome", () => {
    expect(() =>
      assertSameRomeAndUtcDay(new Date("2026-10-22T10:00:00.000Z"))
    ).not.toThrow()
  })
})

describe("romeDay", () => {
  it("is the Rome calendar day, not the UTC one", () => {
    expect(romeDay(new Date("2026-10-21T22:30:00.000Z"))).toBe("2026-10-22")
    expect(romeDay(new Date("2026-10-21T21:59:59.999Z"))).toBe("2026-10-21")
    // CET: 23:30 UTC of 15 January is already the 16th in Rome
    expect(romeDay(new Date("2026-01-15T23:30:00.000Z"))).toBe("2026-01-16")
  })
})

describe("assertSameRomeAndUtcDay (more)", () => {
  it("explains the stop in Italian", () => {
    expect(() =>
      assertSameRomeAndUtcDay(new Date("2026-10-21T22:30:00.000Z"))
    ).toThrow(/mezzanotte.*update.*UTC/s)
  })

  it("stops in the CET window too, and passes right after it", () => {
    expect(() =>
      assertSameRomeAndUtcDay(new Date("2026-01-15T23:30:00.000Z"))
    ).toThrow(/Europe\/Rome/)
    expect(() =>
      assertSameRomeAndUtcDay(new Date("2026-01-16T00:00:00.000Z"))
    ).not.toThrow()
  })
})

describe("romeNoon / romeMidnight", () => {
  it("noon in Rome falls on the same UTC day, also at the DST changes", () => {
    for (const day of [
      "2026-10-21",
      "2026-03-29",
      "2026-10-25",
      "2026-01-15",
    ]) {
      expect(romeNoon(day).toISOString().slice(0, 10)).toBe(day)
    }
  })

  it("handles CET and CEST", () => {
    expect(romeNoon("2026-03-29").toISOString()).toBe(
      "2026-03-29T10:00:00.000Z"
    )
    expect(romeNoon("2026-10-25").toISOString()).toBe(
      "2026-10-25T11:00:00.000Z"
    )
    expect(romeNoon("2026-01-15").toISOString()).toBe(
      "2026-01-15T11:00:00.000Z"
    )
    expect(romeNoon("2026-07-15").toISOString()).toBe(
      "2026-07-15T10:00:00.000Z"
    )
  })

  it("midnight is the previous UTC evening", () => {
    expect(romeMidnight("2026-10-22").toISOString()).toBe(
      "2026-10-21T22:00:00.000Z"
    )
    expect(romeMidnight("2026-03-29").toISOString()).toBe(
      "2026-03-28T23:00:00.000Z"
    )
    expect(romeMidnight("2026-03-30").toISOString()).toBe(
      "2026-03-29T22:00:00.000Z"
    )
    expect(romeMidnight("2026-10-25").toISOString()).toBe(
      "2026-10-24T22:00:00.000Z"
    )
    expect(romeMidnight("2026-10-26").toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    )
  })

  it("round-trips through romeDay", () => {
    for (const day of [
      "2026-03-29",
      "2026-10-25",
      "2028-02-29",
      "2026-12-31",
    ]) {
      expect(romeDay(romeNoon(day))).toBe(day)
      expect(romeDay(romeMidnight(day))).toBe(day)
    }
  })

  it("rejects malformed or impossible days", () => {
    expect(() => romeNoon("2026-2-3")).toThrow()
    expect(() => romeNoon("2026-02-30")).toThrow()
  })
})

describe("day arithmetic", () => {
  it("addDays crosses months, years and leap days", () => {
    expect(addDays("2026-10-21", 1)).toBe("2026-10-22")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2026-10-21", 0)).toBe("2026-10-21")
  })

  it("subMonthsDay clamps to the end of the month like date-fns", () => {
    expect(subMonthsDay("2026-05-31", 3)).toBe("2026-02-28")
    expect(subMonthsDay("2028-05-31", 3)).toBe("2028-02-29")
    expect(subMonthsDay("2026-03-31", 1)).toBe("2026-02-28")
    expect(subMonthsDay("2026-01-15", 2)).toBe("2025-11-15")
    expect(subMonthsDay("2026-10-21", 3)).toBe("2026-07-21")
  })

  it("addMonthsDay clamps the same way", () => {
    expect(addMonthsDay("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsDay("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonthsDay("2026-11-30", 3)).toBe("2027-02-28")
    expect(addMonthsDay("2026-10-21", 14)).toBe("2027-12-21")
    expect(addMonthsDay("2026-10-21", 0)).toBe("2026-10-21")
  })

  it("agrees with date-fns on a sweep of days", () => {
    let day = "2024-01-01"
    for (let i = 0; i < 1500; i++) {
      const d = new Date(`${day}T12:00:00.000Z`)
      for (const n of [1, 3, 12]) {
        expect(subMonthsDay(day, n)).toBe(
          subMonths(d, n).toISOString().slice(0, 10)
        )
        expect(addMonthsDay(day, n)).toBe(
          addMonths(d, n).toISOString().slice(0, 10)
        )
      }
      day = addDays(day, 1)
    }
  })
})

describe("assertIsToday", () => {
  it("passes on the same Rome day", () => {
    expect(() =>
      assertIsToday("2026-10-22", new Date("2026-10-21T22:30:00.000Z"))
    ).not.toThrow()
  })

  it("asks for a new seed when the manifest is of another day", () => {
    expect(() =>
      assertIsToday("2026-10-21", new Date("2026-10-22T10:00:00.000Z"))
    ).toThrow(/2026-10-21.*2026-10-22.*pnpm seed:local/s)
  })
})
