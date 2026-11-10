import { describe, expect, it } from "vitest"
import {
  type CallHour,
  type CallsByOperator,
  type MyCallSeries,
} from "@mito/contract/analytics"
import { comparisonHours, todayHours } from "@mito/domain/analytics/hours"
import { type Role } from "@mito/contract/schemas"
import { type Compare } from "@mito/domain/analytics/window"
import { allFileName, exportHeader, fileName } from "../export"
import { adminAppointmentsResult, adminCallsResult } from "../rankings"
import { myAppointmentsResult, myCallsResult } from "../trends"

// The call charts with «Oggi» (spec andamenti-chiamate, AC20, AC21, AC23–AC25, D1, D10)

const NOTE = "La giornata di lavoro inizia alle 8: vedi le ore di ieri"
const today = { from: "2026-11-10", to: "2026-11-10" }
const yesterday = { from: "2026-11-09", to: "2026-11-09" }
const at = (time: string) => new Date(`2026-11-10T${time}:00+01:00`)

const input = <D>(data: D, compare: Compare, role: Role = "ADMIN") => ({
  data,
  range: "today" as const,
  compare,
  group: "hour" as const,
  role,
  completeSince: "2026-09-15",
})

const anna = {
  operatorId: 1,
  name: "Anna",
  surname: "Rossi",
  calls: 10,
  answered: 6,
  noAnswer: 4,
  appointments: 2,
}
const bruno = {
  ...anna,
  operatorId: 2,
  name: "Bruno",
  calls: 4,
  answered: 1,
  noAnswer: 3,
}

/** The admin's answer as the server gives it at `now` */
const callsAt = (now: Date, compare: Compare): CallsByOperator => {
  const hours = todayHours(now)
  const compared = comparisonHours(hours, compare, now)
  return {
    window: today,
    comparison: compare === "none" ? null : yesterday,
    hours,
    comparisonHours: compared,
    rows: hours.length === 0 ? [] : [anna],
    comparisonRows: compared === null ? null : compared.length ? [bruno] : [],
    comparisonTotals:
      compare === "none" ? null : { calls: 4, answered: 1, appointments: 2 },
  }
}

/** The operator's answer at `now`: `calls` in every hour, and in yesterday's */
const seriesAt = (now: Date, compare: Compare): MyCallSeries => {
  const withCounts = (
    slots: ReturnType<typeof todayHours>,
    calls: number
  ): CallHour[] =>
    slots.map((slot) => ({
      ...slot,
      calls,
      answered: calls - 1,
      noAnswer: 1,
      appointments: 1,
    }))
  const hours = todayHours(now)
  const compared = comparisonHours(hours, compare, now)
  return {
    window: today,
    comparison: compare === "none" ? null : yesterday,
    hours: withCounts(hours, 5),
    comparisonHours: compared === null ? null : withCounts(compared, 3),
    days: [],
    comparisonDays: [],
  }
}

describe("the admin's rankings with «Oggi» (AC21, AC24, D1)", () => {
  it("count the rows of today's hours, compared with the totals of yesterday's", () => {
    const result = adminCallsResult(
      input(callsAt(at("15:20"), "previous"), "previous")
    )

    expect(result.status.kind).toBe("ready")
    expect(result.table.rows.map((row) => row[0])).toEqual([
      "Anna Rossi",
      "Totale",
    ])
    expect(result.kpi.delta).toEqual({ kind: "percent", value: 150 })
    expect(result.lead).toBeUndefined()
  })

  it("before 08 with «Periodo precedente» show yesterday's rows, with the note and no variation", () => {
    const data = callsAt(at("07:15"), "previous")
    const calls = adminCallsResult(input(data, "previous"))
    const rate = adminAppointmentsResult(input(data, "previous"))

    expect(calls.status.kind).toBe("ready")
    expect(calls.lead).toBe(NOTE)
    expect(calls.table.rows.map((row) => row[0])).toEqual([
      "Bruno Rossi",
      "Totale",
    ])
    expect(calls.kpi).toMatchObject({ value: 4, delta: null })
    expect(calls.totals?.map((total) => [total.value, total.delta])).toEqual([
      [4, null],
      [1, null],
      [3, null],
      [2, null],
    ])
    expect(rate.lead).toBe(NOTE)
    expect(rate.kpi.delta).toBeNull()
    expect(rate.table.rows.map((row) => row[0])).toEqual(["Bruno Rossi"])
  })

  it.each(["none", "last-year"] as const)(
    "before 08 with %s are empty, with «Vedi ieri» on the comparison",
    (compare) => {
      const data = callsAt(at("07:15"), compare)
      for (const result of [
        adminCallsResult(input(data, compare)),
        adminAppointmentsResult(input(data, compare)),
      ]) {
        expect(result.status).toEqual({
          kind: "empty",
          title: "Nessuna ora di oggi",
          reason: "La giornata di lavoro inizia alle 8",
          action: { label: "Vedi ieri", compare: "previous" },
        })
        expect(result.lead).toBeUndefined()
      }
    }
  )

  it("widens to 7 days from any other empty state of «Oggi» (AC24)", () => {
    const data = { ...callsAt(at("15:20"), "previous"), rows: [] }
    expect(adminCallsResult(input(data, "previous")).status).toMatchObject({
      kind: "empty",
      action: { label: "Allarga a 7 giorni", range: "7d" },
    })
  })
})

describe("the operator's series with «Oggi» (AC20, AC21, AC23, AC24)", () => {
  it("has one interval per hour, the last in progress, each compared with its hour", () => {
    const result = myCallsResult(
      input(seriesAt(at("15:20"), "previous"), "previous", "OPERATORE")
    )

    expect(result.status.kind).toBe("ready")
    expect(result.points).toHaveLength(8)
    expect(result.points.at(0)).toMatchObject({
      label: "08:00",
      longLabel: "08:00–09:00",
      answered: 4,
      noAnswer: 1,
      comparisonCalls: 3,
    })
    expect(result.table.rows.at(-1)?.[0]).toBe("15:00–15:20 (in corso)")
    // 8 hours of 5 calls against 8 of 3
    expect(result.kpi).toMatchObject({ value: 40 })
    expect(result.kpi.delta?.kind).toBe("percent")
  })

  it("is number only with a single hour, and «Mostra 7 giorni» stays (AC23)", () => {
    const data = seriesAt(at("08:30"), "previous")
    for (const result of [
      myCallsResult(input(data, "previous", "OPERATORE")),
      myAppointmentsResult(input(data, "previous", "OPERATORE")),
    ]) {
      expect(result.status).toMatchObject({
        kind: "kpiOnly",
        title: "Un solo intervallo",
        action: { label: "Mostra 7 giorni", range: "7d" },
      })
    }
  })

  it("before 08 with «Periodo precedente» draws yesterday's 11–19 with today's values empty", () => {
    const data = seriesAt(at("07:15"), "previous")
    const calls = myCallsResult(input(data, "previous", "OPERATORE"))
    const rate = myAppointmentsResult(input(data, "previous", "OPERATORE"))

    expect(calls.status.kind).toBe("ready")
    expect(calls.lead).toBe(NOTE)
    expect(calls.points.map((p) => p.longLabel)).toEqual([
      "11:00–12:00",
      "12:00–13:00",
      "13:00–14:00",
      "14:00–15:00",
      "15:00–16:00",
      "16:00–17:00",
      "17:00–18:00",
      "18:00–19:00",
    ])
    expect(calls.points.at(0)).toMatchObject({
      answered: null,
      noAnswer: null,
      comparisonCalls: 3,
    })
    expect(calls.table.rows.at(0)).toEqual([
      "11:00–12:00",
      null,
      null,
      null,
      null,
      null,
      3,
    ])
    expect(calls.kpi.delta).toBeNull()
    expect(rate.status.kind).toBe("ready")
    expect(rate.lead).toBe(NOTE)
    expect(rate.points.at(0)).toMatchObject({ rate: null, comparisonRate: 50 })
  })

  it.each(["none", "last-year"] as const)(
    "before 08 with %s is empty, with «Vedi ieri»",
    (compare) => {
      const data = seriesAt(at("07:15"), compare)
      expect(
        myCallsResult(input(data, compare, "OPERATORE")).status
      ).toMatchObject({
        kind: "empty",
        reason: "La giornata di lavoro inizia alle 8",
        action: { label: "Vedi ieri", compare: "previous" },
      })
    }
  )
})

describe("the files with «Oggi» (AC25, D10)", () => {
  it("carry today's date once", () => {
    expect(fileName("calls", today, "csv", "today")).toBe(
      "mito_risposte-per-operatore_2026-11-10.csv"
    )
    expect(allFileName(today, "today")).toBe("mito_analisi_2026-11-10.xlsx")
  })

  const header = (
    result: Parameters<typeof exportHeader>[0],
    hours: ReturnType<typeof todayHours> | null,
    compared: ReturnType<typeof todayHours> | null,
    group: "hour" | null
  ) =>
    exportHeader(result, {
      window: today,
      comparison: yesterday,
      compare: "previous",
      group,
      dataOf: "tutta la rete",
      extractedAt: at("15:20"),
      today: { hours, comparisonHours: compared },
    })

  it("write the hours of the call charts, and of their comparison", () => {
    const now = at("15:20")
    const hours = todayHours(now)
    const rows = header(
      myCallsResult(input(seriesAt(now, "previous"), "previous", "OPERATORE")),
      hours,
      comparisonHours(hours, "previous", now),
      "hour"
    )
    expect(rows).toContainEqual(["Finestra", "Oggi, 08:00–15:20"])
    expect(rows).toContainEqual([
      "Confronto",
      "Periodo precedente: 9 nov 2026, 08:00–15:20",
    ])
    expect(rows).toContainEqual(["Raggruppamento", "per ora"])
  })

  it("write the note of yesterday's hours before 08", () => {
    const now = at("07:15")
    const rows = header(
      adminCallsResult(input(callsAt(now, "previous"), "previous")),
      [],
      comparisonHours([], "previous", now),
      null
    )
    expect(rows).toContainEqual(["Nota", NOTE])
    expect(rows).toContainEqual([
      "Confronto",
      "Periodo precedente: 9 nov 2026, 11:00–19:00",
    ])
  })
})
