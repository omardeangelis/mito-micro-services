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

// The same day rule for any instant of the Rome day, not only the midnights
// the date picker sends: the whole day is due, the first instant of the next
// one is not, also on the days the clock changes (23 and 25 hours)
describe("isDueOrOverdue: any instant of the day", () => {
  it.each([
    {
      name: "a summer day",
      now: "2026-07-15T10:00:00Z",
      laterToday: "2026-07-15T15:00:00Z",
    },
    {
      name: "a winter day",
      now: "2026-12-15T10:00:00Z",
      laterToday: "2026-12-15T16:00:00Z",
    },
    {
      name: "the day the clock goes forward (23 hours)",
      now: "2026-03-29T10:00:00Z",
      laterToday: "2026-03-29T15:00:00Z",
    },
    {
      name: "the day the clock goes back (25 hours)",
      now: "2026-10-25T10:00:00Z",
      laterToday: "2026-10-25T16:00:00Z",
    },
  ])(
    "on $name, a later hour of today and its last millisecond are due, the first millisecond of tomorrow is not",
    ({ now: nowValue, laterToday }) => {
      const now = new Date(nowValue)
      const { end } = romeDayBounds(now)

      expect(isDueOrOverdue(new Date(laterToday), now)).toBe(true)
      expect(isDueOrOverdue(new Date(end.getTime() - 1), now)).toBe(true)
      expect(isDueOrOverdue(end, now)).toBe(false)
    }
  )
})

// Between the Rome midnight and the UTC midnight the Rome day is already the
// next one while the UTC day is still the previous one: 1 or 2 hours every
// night, when the nightly cron runs. "Today" is the Rome day, not the UTC day
// and not the day of the machine.
describe("isDueOrOverdue: just after the Rome midnight", () => {
  it.each([
    { name: "a summer day", now: "2026-07-14T22:30:00Z" },
    { name: "a winter day", now: "2026-12-14T23:30:00Z" },
    { name: "the day the clock goes forward", now: "2026-03-28T23:30:00Z" },
    { name: "the day the clock goes back", now: "2026-10-24T22:30:00Z" },
    {
      name: "the day after the clock went forward",
      now: "2026-03-29T22:30:00Z",
    },
    { name: "the day after the clock went back", now: "2026-10-25T23:30:00Z" },
  ])(
    "at 00:30 on $name, the whole Rome day is due and the first instant of the next one is not",
    ({ now: nowValue }) => {
      const now = new Date(nowValue)
      const { start, end } = romeDayBounds(now)

      expect(isDueOrOverdue(new Date(start.getTime() - 1), now)).toBe(true)
      expect(isDueOrOverdue(start, now)).toBe(true)
      expect(isDueOrOverdue(new Date(end.getTime() - 1), now)).toBe(true)
      expect(isDueOrOverdue(end, now)).toBe(false)
    }
  )
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
