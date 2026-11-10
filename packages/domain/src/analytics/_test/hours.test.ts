import { describe, expect, it } from "vitest"
import { comparisonHours, hourLabel, hoursSpan, todayHours } from "../hours"

// 10/11/2026 is winter time: Rome is UTC+1
const rome = (time: string) => new Date(`2026-11-10T${time}+01:00`)

describe("todayHours (Definizioni)", () => {
  it("at 16:00:00 drops 08–09 and opens 16–16:00 in progress", () => {
    const slots = todayHours(rome("16:00:00"))

    expect(slots).toEqual([
      { start: rome("09:00"), end: rome("10:00"), inProgress: false },
      { start: rome("10:00"), end: rome("11:00"), inProgress: false },
      { start: rome("11:00"), end: rome("12:00"), inProgress: false },
      { start: rome("12:00"), end: rome("13:00"), inProgress: false },
      { start: rome("13:00"), end: rome("14:00"), inProgress: false },
      { start: rome("14:00"), end: rome("15:00"), inProgress: false },
      { start: rome("15:00"), end: rome("16:00"), inProgress: false },
      { start: rome("16:00"), end: rome("16:00"), inProgress: true },
    ])
  })
})

const spans = (slots: { start: Date; end: Date }[], offset = "+01:00") =>
  slots.map(
    (s) => `${s.start.toISOString()}/${s.end.toISOString()}${offset ? "" : ""}`
  )

const at = (iso: string) => new Date(iso)
const labels = (iso: string) => todayHours(at(iso)).map(hourLabel)

describe("todayHours table", () => {
  it("07:15 has no hours", () => {
    expect(todayHours(rome("07:15:00"))).toEqual([])
  })

  it("08:00:00 has 08–08:00 in progress", () => {
    expect(labels("2026-11-10T08:00:00+01:00")).toEqual([
      "08:00–08:00 (in corso)",
    ])
  })

  it("10:30 has three hours", () => {
    expect(labels("2026-11-10T10:30:00+01:00")).toEqual([
      "08:00–09:00",
      "09:00–10:00",
      "10:00–10:30 (in corso)",
    ])
  })

  it("15:20 has eight hours, the last in progress", () => {
    const slots = todayHours(rome("15:20:00"))
    expect(slots).toHaveLength(8)
    expect(slots.map(hourLabel)[0]).toBe("08:00–09:00")
    expect(slots.map(hourLabel)[7]).toBe("15:00–15:20 (in corso)")
  })

  it("18:40 goes from 11 to 18:40", () => {
    const slots = todayHours(rome("18:40:00"))
    expect(slots).toHaveLength(8)
    expect(hoursSpan(slots)).toBe("11:00–18:40")
    expect(slots[7]?.inProgress).toBe(true)
  })

  it.each(["19:00:00", "23:59:00"])("%s has 11–19 whole", (time) => {
    const slots = todayHours(rome(time))
    expect(slots).toHaveLength(8)
    expect(hoursSpan(slots)).toBe("11:00–19:00")
    expect(slots.every((s) => !s.inProgress)).toBe(true)
  })

  it("AC26: 15–16 ends at 16:00 and 16–17 starts there", () => {
    const slots = todayHours(rome("16:00:00"))
    const before = slots[6]
    const next = slots[7]
    expect(before?.end).toEqual(rome("16:00:00"))
    expect(next?.start).toEqual(rome("16:00:00"))
  })

  it("works on the DST days", () => {
    // 29/03/2026 is UTC+2 from 03:00, 25/10/2026 is UTC+1 from 03:00
    expect(
      todayHours(new Date("2026-03-29T15:20:00+02:00")).map(hourLabel)
    ).toHaveLength(8)
    const spring = todayHours(new Date("2026-03-29T15:20:00+02:00"))
    expect(spring[7]?.start).toEqual(new Date("2026-03-29T15:00:00+02:00"))
    expect(spring[0]?.start).toEqual(new Date("2026-03-29T08:00:00+02:00"))
    const autumn = todayHours(new Date("2026-10-25T15:20:00+01:00"))
    expect(autumn[7]?.start).toEqual(new Date("2026-10-25T15:00:00+01:00"))
    expect(autumn[0]?.start).toEqual(new Date("2026-10-25T08:00:00+01:00"))
    expect(spans(autumn)).toHaveLength(8)
  })
})

describe("comparisonHours (AC20, AC24)", () => {
  const now = rome("15:20:00")

  it("previous: the same hours of yesterday, to the same minutes", () => {
    const result = comparisonHours(todayHours(now), "previous", now)
    expect(result).toHaveLength(8)
    expect(result?.[0]?.start).toEqual(new Date("2026-11-09T08:00:00+01:00"))
    const last = result?.[7]
    expect(last?.start).toEqual(new Date("2026-11-09T15:00:00+01:00"))
    expect(last?.end).toEqual(new Date("2026-11-09T15:20:00+01:00"))
    expect(last?.inProgress).toBe(true)
  })

  it("last-year: the same hours on 10/11/2025", () => {
    const result = comparisonHours(todayHours(now), "last-year", now)
    expect(result).toHaveLength(8)
    expect(result?.[0]?.start).toEqual(new Date("2025-11-10T08:00:00+01:00"))
    expect(result?.[7]?.end).toEqual(new Date("2025-11-10T15:20:00+01:00"))
  })

  it("last-year on 29 February has no comparison", () => {
    const leap = new Date("2028-02-29T15:20:00+01:00")
    expect(comparisonHours(todayHours(leap), "last-year", leap)).toBeNull()
  })

  it("none has no comparison", () => {
    expect(comparisonHours(todayHours(now), "none", now)).toBeNull()
  })

  it("before 08 previous is yesterday 11–19 whole", () => {
    const early = rome("07:15:00")
    const result = comparisonHours(todayHours(early), "previous", early)
    expect(result).toHaveLength(8)
    expect(hoursSpan(result ?? [])).toBe("11:00–19:00")
    expect(result?.[0]?.start).toEqual(new Date("2026-11-09T11:00:00+01:00"))
    expect(result?.every((s) => !s.inProgress)).toBe(true)
  })

  it("before 08 last-year is empty", () => {
    const early = rome("07:15:00")
    expect(comparisonHours(todayHours(early), "last-year", early)).toEqual([])
  })

  it("yesterday with a DST change keeps the wall-clock hours", () => {
    const monday = new Date("2026-03-30T10:30:00+02:00")
    const result = comparisonHours(todayHours(monday), "previous", monday)
    expect(result?.[0]?.start).toEqual(new Date("2026-03-29T08:00:00+02:00"))
  })
})

describe("hourLabel and hoursSpan", () => {
  it("labels a whole and an in-progress hour", () => {
    expect(
      hourLabel({
        start: rome("15:00:00"),
        end: rome("16:00:00"),
        inProgress: false,
      })
    ).toBe("15:00–16:00")
    expect(
      hourLabel({
        start: rome("15:00:00"),
        end: rome("15:20:00"),
        inProgress: true,
      })
    ).toBe("15:00–15:20 (in corso)")
  })

  it("spans first start to last end, null when empty", () => {
    expect(hoursSpan(todayHours(rome("15:20:00")))).toBe("08:00–15:20")
    expect(hoursSpan([])).toBeNull()
  })
})
