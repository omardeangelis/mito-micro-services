import { describe, expect, it } from "vitest"
import { type CallTrend } from "@mito/contract/home"
import { bucketsOf } from "@mito/domain/analytics/buckets"
import {
  barText,
  periodRate,
  periodText,
  todayLabel,
  trendBars,
  trendEmpty,
  trendHref,
} from "../callTrend"

// The bars of «Andamento delle chiamate» (spec andamenti-chiamate, AC5, AC6)

const day = (
  day: string,
  calls: number,
  answered: number,
  appointments: number
) => ({
  day,
  calls,
  answered,
  noAnswer: calls - answered,
  appointments,
})

describe("trendBars", () => {
  it("cuts 30 days in 5 weeks, with a value only where there are calls (AC5, AC6)", () => {
    const trend: CallTrend = {
      period: "30d",
      window: { from: "2026-10-12", to: "2026-11-10" },
      days: [day("2026-11-03", 10, 4, 1)],
      hours: null,
    }

    const bars = trendBars(trend)

    expect(bars).toHaveLength(5)
    expect(bars.map((bar) => bar.answerRate)).toEqual([
      null,
      null,
      null,
      40,
      null,
    ])
    expect(bars.map((bar) => bar.appointmentRate)).toEqual([
      null,
      null,
      null,
      25,
      null,
    ])
  })
})

const window30 = { from: "2026-10-12", to: "2026-11-10" }
const trend30 = (days: CallTrend["days"]): CallTrend => ({
  period: "30d",
  window: window30,
  days,
  hours: null,
})
const hour = (
  start: string,
  end: string,
  inProgress: boolean,
  calls: number,
  answered: number,
  appointments: number
) => ({
  start: new Date(start),
  end: new Date(end),
  inProgress,
  calls,
  answered,
  noAnswer: calls - answered,
  appointments,
})

describe("trendBars buckets", () => {
  it("matches the weeks of Analisi with group=week on 30 days", () => {
    const expected = bucketsOf({
      window: window30,
      group: "week",
      compare: "none",
      comparison: null,
    })
    const bars = trendBars(trend30([]))
    expect(bars.map((b) => b.label)).toEqual(expected.map((b) => b.label))
    expect(bars.map((b) => b.key)).toEqual(expected.map((b) => b.from))
    // 12 Oct is a Monday: only the last week (9–10 Nov) is cut, and says so
    expect(bars[0]?.longLabel).not.toContain("(parziale)")
    expect(bars[4]?.longLabel).toContain("(parziale)")
    expect(bars[2]?.longLabel).not.toContain("(parziale)")
  })

  it("cuts 7 days one per Rome day, today included", () => {
    const bars = trendBars({
      period: "7d",
      window: { from: "2026-11-04", to: "2026-11-10" },
      days: [day("2026-11-04", 150, 48, 5)],
      hours: null,
    })
    expect(bars).toHaveLength(7)
    expect(bars[0]?.longLabel).toBe("Mer 4 nov")
    expect(bars[6]?.label).toBe("10 nov")
  })

  it("reads hours of Oggi in order, the one in progress says so", () => {
    const bars = trendBars({
      period: "today",
      window: { from: "2026-11-10", to: "2026-11-10" },
      days: [],
      hours: [
        hour("2026-11-10T13:00:00Z", "2026-11-10T14:00:00Z", false, 5, 2, 1),
        hour("2026-11-10T14:00:00Z", "2026-11-10T14:20:00Z", true, 10, 10, 4),
      ],
    })
    expect(bars.map((b) => b.longLabel)).toEqual([
      "14:00–15:00",
      "15:00–15:20 (in corso)",
    ])
    expect(barText(bars[1]!, "appointment")).toBe(
      "15:00–15:20 (in corso) · 40% · 4 appuntamenti su 10 risposte"
    )
  })
})

describe("rates", () => {
  it.each([
    { calls: 0, answered: 0, appointments: 0, answer: null, appointment: null },
    { calls: 5, answered: 0, appointments: 0, answer: 0, appointment: null },
    { calls: 5, answered: 2, appointments: 0, answer: 40, appointment: 0 },
  ])("calls $calls answered $answered", (c) => {
    const bars = trendBars(
      trend30([day("2026-11-03", c.calls, c.answered, c.appointments)])
    )
    const bar = bars[3]
    expect(bar?.answerRate).toBe(c.answer)
    expect(bar?.appointmentRate).toBe(c.appointment)
  })

  it("period rate equals the rate of the sums", () => {
    const bars = trendBars(
      trend30([day("2026-10-14", 10, 5, 1), day("2026-11-03", 30, 6, 3)])
    )
    expect(periodRate(bars, "answer")).toEqual({
      rate: 27.5,
      numerator: 11,
      denominator: 40,
    })
    expect(periodRate(bars, "appointment")).toEqual({
      rate: (4 * 100) / 11,
      numerator: 4,
      denominator: 11,
    })
    expect(periodRate([], "answer").rate).toBeNull()
  })
})

describe("texts", () => {
  it("writes the name, rate and the two numbers (AC7, AC8)", () => {
    const bars = trendBars({
      period: "7d",
      window: { from: "2026-11-04", to: "2026-11-10" },
      days: [day("2026-11-04", 150, 48, 5), day("2026-11-05", 3, 0, 0)],
      hours: null,
    })
    expect(barText(bars[0]!, "answer")).toBe(
      "Mer 4 nov · 32% · 48 risposte su 150 chiamate"
    )
    expect(barText(bars[1]!, "answer")).toBe(
      "Gio 5 nov · 0% · 0 risposte su 3 chiamate"
    )
    expect(barText(bars[1]!, "appointment")).toBe(
      "Gio 5 nov · nessuna risposta"
    )
    expect(barText(bars[2]!, "answer")).toBe("Ven 6 nov · nessuna chiamata")
    expect(
      periodText({ rate: 31, numerator: 1240, denominator: 4000 }, "answer")
    ).toBe("31% · 1.240 risposte su 4.000 chiamate")
    expect(
      periodText({ rate: null, numerator: 0, denominator: 0 }, "answer")
    ).toBe("Nessuna chiamata")
  })
})

describe("trendHref", () => {
  it.each([
    ["today", "range=today&group=hour"],
    ["7d", "range=7d&group=day"],
    ["30d", "range=30d&group=week"],
    ["90d", "range=90d&group=week"],
  ] as const)("%s", (period, query) => {
    expect(trendHref(period, "calls")).toBe(
      `/dashboard/analisi?${query}&chart=calls`
    )
    expect(trendHref(period, "appointments")).toBe(
      `/dashboard/analisi?${query}&chart=appointments`
    )
  })
})

describe("trendEmpty and todayLabel", () => {
  const today = (hours: CallTrend["hours"]): CallTrend => ({
    period: "today",
    window: { from: "2026-11-10", to: "2026-11-10" },
    days: [],
    hours,
  })

  it("says there are no calls, or that the work day hasn't begun", () => {
    expect(trendEmpty(trend30([]))).toEqual({
      title: "Nessuna chiamata nel periodo",
    })
    expect(trendEmpty(trend30([day("2026-11-03", 1, 0, 0)]))).toBeNull()
    expect(trendEmpty(today([]))).toEqual({
      title: "La giornata di lavoro inizia alle 8",
      action: {
        label: "Vedi ieri",
        href: "/dashboard/analisi?range=today&group=hour&compare=previous&chart=calls",
      },
    })
    const quiet = today([
      hour("2026-11-10T07:00:00Z", "2026-11-10T07:30:00Z", true, 0, 0, 0),
    ])
    expect(trendEmpty(quiet)).toEqual({ title: "Nessuna chiamata nel periodo" })
  })

  it("writes the hours Oggi covers", () => {
    const t = today([
      hour("2026-11-10T07:00:00Z", "2026-11-10T08:00:00Z", false, 1, 1, 0),
      hour("2026-11-10T13:00:00Z", "2026-11-10T14:20:00Z", true, 1, 1, 0),
    ])
    expect(todayLabel(t)).toBe("Oggi, 08:00–15:20")
    expect(todayLabel(today([]))).toBeNull()
    expect(todayLabel(trend30([]))).toBeNull()
  })
})
