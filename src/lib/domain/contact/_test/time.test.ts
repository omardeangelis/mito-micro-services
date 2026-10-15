import { describe, expect, it } from "vitest"
import { isDueOrOverdue, isPastDay, romeDayBounds } from "../time"

describe("isPastDay", () => {
  // 00:30 of 15/10/2026 in Rome (summer time, UTC+2)
  const now = new Date("2026-10-14T22:30:00Z")

  it("compares days in Rome, not in UTC", () => {
    // Deadlines picked in the date picker: midnight of the browser in Rome
    expect(isPastDay(new Date("2026-10-14T22:00:00Z"), now)).toBe(false)
    expect(isPastDay(new Date("2026-10-13T22:00:00Z"), now)).toBe(true)
  })
})

describe("isDueOrOverdue", () => {
  it("holds for a deadline at 00:00 of today in Rome until the day ends", () => {
    // 23:59 of 15/10/2026 in Rome, and 00:00 of the same day
    const now = new Date("2026-10-15T21:59:00Z")
    expect(isDueOrOverdue(new Date("2026-10-14T22:00:00Z"), now)).toBe(true)
    expect(isDueOrOverdue(new Date("2026-10-15T22:00:00Z"), now)).toBe(false)
  })
})

describe("deadlines picked in the date picker", () => {
  // Midnight of the browser in Rome: 22:00 UTC of the day before in summer time
  it("compares summer deadlines by their Rome day", () => {
    // 12:00 of 15/10/2026 in Rome
    const now = new Date("2026-10-15T10:00:00Z")
    const yesterday = new Date("2026-10-13T22:00:00Z")
    const today = new Date("2026-10-14T22:00:00Z")
    const tomorrow = new Date("2026-10-15T22:00:00Z")

    expect(isPastDay(yesterday, now)).toBe(true)
    expect(isDueOrOverdue(yesterday, now)).toBe(true)
    expect(isPastDay(today, now)).toBe(false)
    expect(isDueOrOverdue(today, now)).toBe(true)
    expect(isPastDay(tomorrow, now)).toBe(false)
    expect(isDueOrOverdue(tomorrow, now)).toBe(false)
  })

  // Midnight of the browser in Rome: 23:00 UTC of the day before in winter time
  it("compares winter deadlines by their Rome day", () => {
    // 11:00 of 15/01/2027 in Rome
    const now = new Date("2027-01-15T10:00:00Z")
    const yesterday = new Date("2027-01-13T23:00:00Z")
    const today = new Date("2027-01-14T23:00:00Z")
    const tomorrow = new Date("2027-01-15T23:00:00Z")

    expect(isPastDay(yesterday, now)).toBe(true)
    expect(isDueOrOverdue(yesterday, now)).toBe(true)
    expect(isPastDay(today, now)).toBe(false)
    expect(isDueOrOverdue(today, now)).toBe(true)
    expect(isPastDay(tomorrow, now)).toBe(false)
    expect(isDueOrOverdue(tomorrow, now)).toBe(false)
  })
})

describe("romeDayBounds", () => {
  it.each([
    {
      name: "spring forward day (23 hours)",
      date: "2026-03-29T10:00:00Z",
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T22:00:00.000Z",
    },
    {
      name: "late evening of the spring forward day",
      date: "2026-03-29T21:30:00Z",
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T22:00:00.000Z",
    },
    {
      name: "fall back day (25 hours)",
      date: "2026-10-25T12:00:00Z",
      start: "2026-10-24T22:00:00.000Z",
      end: "2026-10-25T23:00:00.000Z",
    },
    {
      name: "late evening of the fall back day",
      date: "2026-10-25T22:30:00Z",
      start: "2026-10-24T22:00:00.000Z",
      end: "2026-10-25T23:00:00.000Z",
    },
    {
      name: "spring forward day of 2027",
      date: "2027-03-28T10:00:00Z",
      start: "2027-03-27T23:00:00.000Z",
      end: "2027-03-28T22:00:00.000Z",
    },
    {
      name: "ordinary summer day",
      date: "2026-07-10T12:00:00Z",
      start: "2026-07-09T22:00:00.000Z",
      end: "2026-07-10T22:00:00.000Z",
    },
    {
      name: "ordinary winter day",
      date: "2026-12-10T12:00:00Z",
      start: "2026-12-09T23:00:00.000Z",
      end: "2026-12-10T23:00:00.000Z",
    },
  ])("bounds the Rome day of $name", ({ date, start, end }) => {
    expect(romeDayBounds(new Date(date))).toEqual({
      start: new Date(start),
      end: new Date(end),
    })
  })
})
