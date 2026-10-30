import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import {
  type AnalysisQuery,
  type BranchTotals,
  type CallsByOperator,
  type FinancedSeries,
  type MyCallSeries,
} from "@mito/contract/analytics"
import { MitoApi } from "@mito/contract/api"
import { comparisonOf } from "@mito/domain/analytics/window"
import { addDays } from "@mito/domain/utils/calendarDays"
import { type FakeHandlers, type GroupService } from "./api"

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** The window the default data is for: October 2026 up to the 30th */
export const octoberWindow: AnalysisQuery = {
  from: "2026-10-01",
  to: "2026-10-30",
  compare: "previous",
}

/** The days from `from` for `count` days, as `YYYY-MM-DD` */
const daysFrom = (from: string, count: number) =>
  Array.from({ length: count }, (_, index) => addDays(from, index))

/** Whether a day is a Saturday or a Sunday (days are noon UTC, no DST) */
const isWeekend = (day: string) => {
  const weekday = new Date(`${day}T12:00:00.000Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** The working days of the 30 days from `from` */
const workingDays = (from: string) =>
  daysFrom(from, 30).filter((day) => !isWeekend(day))

/** The practices financed in October 2026, a working day at a time */
export const octoberFinancedDays: FinancedSeries["days"] = workingDays(
  "2026-10-01"
).map((day, index) => ({
  day,
  practices: 1 + (index % 4),
  amount: 8_000 + (index % 5) * 2_500,
}))

/** The practices financed in the 30 days before: fewer, and a lower amount */
export const septemberFinancedDays: FinancedSeries["comparisonDays"] =
  workingDays("2026-09-01").map((day, index) => ({
    day,
    practices: 1 + (index % 3),
    amount: 6_000 + (index % 4) * 2_000,
  }))

/** The financed series of October 2026 with its comparison */
export const defaultFinancedSeries: Omit<
  FinancedSeries,
  "window" | "comparison"
> = {
  days: octoberFinancedDays,
  comparisonDays: septemberFinancedDays,
}

/** The nine points of sale of the admin's view, one of them with no name */
export const defaultBranchRows: BranchTotals["rows"] = [
  { branch: "Roma", practices: 14, amount: 98_000 },
  { branch: "Milano", practices: 11, amount: 81_500 },
  { branch: "Torino", practices: 9, amount: 64_000 },
  { branch: "Napoli", practices: 8, amount: 52_000 },
  { branch: "Bologna", practices: 6, amount: 41_000 },
  { branch: "Firenze", practices: 5, amount: 33_500 },
  { branch: "Bari", practices: 3, amount: 21_000 },
  { branch: "Palermo", practices: 2, amount: 12_500 },
  { branch: null, practices: 1, amount: 4_000 },
]

/** The total financed by the points of sale in the comparison */
export const defaultComparisonTotal = 280_000

/** Three operators with calls: Carla answered fewer than 15 of hers */
export const defaultCallRows: CallsByOperator["rows"] = [
  {
    operatorId: 1,
    name: "Anna",
    surname: "Rossi",
    calls: 180,
    answered: 120,
    noAnswer: 60,
    appointments: 30,
  },
  {
    operatorId: 2,
    name: "Bruno",
    surname: "Bianchi",
    calls: 150,
    answered: 100,
    noAnswer: 50,
    appointments: 22,
  },
  {
    operatorId: 3,
    name: "Carla",
    surname: "Verdi",
    calls: 20,
    answered: 9,
    noAnswer: 11,
    appointments: 2,
  },
]

/** The totals of the calls of the comparison */
export const defaultComparisonCallTotals: NonNullable<
  CallsByOperator["comparisonTotals"]
> = { calls: 310, answered: 190, appointments: 48 }

/** The own calls of the operator, on the working days of the first weeks */
export const defaultMyCallDays: MyCallSeries["days"] = workingDays("2026-10-01")
  .slice(0, 10)
  .map((day, index) => {
    const calls = 10 + (index % 4) * 3
    const answered = Math.round(calls * 0.6)
    return {
      day,
      calls,
      answered,
      noAnswer: calls - answered,
      appointments: index % 3,
    }
  })

/** The own calls on the working days of the comparison */
export const defaultMyCallComparisonDays: MyCallSeries["comparisonDays"] =
  workingDays("2026-09-01")
    .slice(0, 8)
    .map((day, index) => {
      const calls = 8 + (index % 3) * 2
      const answered = Math.round(calls * 0.5)
      return {
        day,
        calls,
        answered,
        noAnswer: calls - answered,
        appointments: index % 2,
      }
    })

/** The contacts with an outcome, and those still to call */
export const defaultProgress = { done: 120, todo: 80 }

/** The endpoints of the page a test can make fail or keep loading */
export type AnalisiEndpoint =
  "financed" | "branches" | "calls" | "myCalls" | "progress"

/**
 * A backend in memory for the analysis page: the endpoints of `analytics`
 * the page reads, with what each call asked for. `window` and `comparison`
 * echo the query. The cards of the home are `unserved`
 */
export function fakeAnalisi(
  initial: {
    financed?: typeof defaultFinancedSeries
    branchRows?: BranchTotals["rows"]
    comparisonTotal?: number | null
    callRows?: CallsByOperator["rows"]
    comparisonCallTotals?: CallsByOperator["comparisonTotals"]
    myCallDays?: MyCallSeries["days"]
    myCallComparisonDays?: MyCallSeries["comparisonDays"]
    progress?: { done: number; todo: number }
  } = {}
) {
  const state = {
    financed: initial.financed ?? defaultFinancedSeries,
    branchRows: initial.branchRows ?? defaultBranchRows,
    comparisonTotal:
      initial.comparisonTotal === undefined
        ? defaultComparisonTotal
        : initial.comparisonTotal,
    callRows: initial.callRows ?? defaultCallRows,
    comparisonCallTotals:
      initial.comparisonCallTotals === undefined
        ? defaultComparisonCallTotals
        : initial.comparisonCallTotals,
    myCallDays: initial.myCallDays ?? defaultMyCallDays,
    myCallComparisonDays:
      initial.myCallComparisonDays ?? defaultMyCallComparisonDays,
    progress: initial.progress ?? defaultProgress,
    // The query of each read of an endpoint
    financedReads: [] as AnalysisQuery[],
    branchReads: [] as AnalysisQuery[],
    callsReads: [] as AnalysisQuery[],
    myCallsReads: [] as AnalysisQuery[],
    progressReads: 0,
    // The endpoints that don't answer: a 500
    failing: new Set<AnalisiEndpoint>(),
    // The endpoints that answer once their promise settles (`hold`)
    held: {} as Partial<Record<AnalisiEndpoint, Promise<void>>>,
  }

  /** The answer of `endpoint` once it isn't held, or a 500 if it fails */
  const answer = <A>(endpoint: AnalisiEndpoint, read: () => A) =>
    Effect.promise(() => state.held[endpoint] ?? Promise.resolve()).pipe(
      Effect.andThen(
        Effect.suspend(() =>
          state.failing.has(endpoint)
            ? Effect.die("backend down")
            : Effect.succeed(read())
        )
      )
    )

  /** The window of the query and the one it is compared with */
  const windows = (query: AnalysisQuery) => {
    const window = { from: query.from, to: query.to }
    return { window, comparison: comparisonOf(window, query.compare) }
  }

  const handlers: FakeHandlers<GroupService<"analytics">> =
    HttpApiBuilder.group(MitoApi, "analytics", (handlers) =>
      handlers
        .handle("getFinancedTotal", unserved)
        .handle("getFinancedAverage", unserved)
        .handle("getFinancedByBranch", unserved)
        .handle("getContactProgress", () => {
          state.progressReads++
          return answer("progress", () => state.progress)
        })
        .handle("getFinancedSeries", ({ query }) => {
          state.financedReads.push(query)
          return answer("financed", () => ({
            ...windows(query),
            days: state.financed.days,
            comparisonDays:
              query.compare === "none" ? [] : state.financed.comparisonDays,
          }))
        })
        .handle("getBranchTotals", ({ query }) => {
          state.branchReads.push(query)
          return answer("branches", () => ({
            ...windows(query),
            rows: state.branchRows,
            comparisonTotal:
              query.compare === "none" ? null : state.comparisonTotal,
          }))
        })
        .handle("getCallsByOperator", ({ query }) => {
          state.callsReads.push(query)
          return answer("calls", () => ({
            ...windows(query),
            rows: state.callRows,
            comparisonTotals:
              query.compare === "none" ? null : state.comparisonCallTotals,
          }))
        })
        .handle("getMyCallSeries", ({ query }) => {
          state.myCallsReads.push(query)
          return answer("myCalls", () => ({
            ...windows(query),
            days: state.myCallDays,
            comparisonDays:
              query.compare === "none" ? [] : state.myCallComparisonDays,
          }))
        })
    )

  /** Holds the answers of `endpoint` until the function it returns runs */
  const hold = (endpoint: AnalisiEndpoint) => {
    let resolve: (() => void) | undefined
    state.held[endpoint] = new Promise((settle) => {
      resolve = settle
    })
    return () => {
      delete state.held[endpoint]
      resolve?.()
    }
  }

  return { state, handlers, hold }
}
