import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import {
  type BranchTotal,
  type FinancedOverWindows,
  type TimeFrame,
} from "@mito/contract/analytics"
import { MitoApi } from "@mito/contract/api"
import { type CallStats } from "@mito/contract/export"
import {
  type PracticeListQuery,
  type PracticeListRow,
} from "@mito/contract/pratiche"
import { type FakeHandlers, type GroupService } from "./api"
import { practiceRow } from "./pratiche"

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/**
 * The windows of the cards: at noon UTC, the same day in every time zone,
 * and far from today
 */
export const homeWindows: FinancedOverWindows["windows"] = {
  comparison: {
    start: new Date("2026-01-10T12:00:00Z"),
    end: new Date("2026-02-10T12:00:00Z"),
  },
  reference: {
    start: new Date("2026-02-10T12:00:00Z"),
    end: new Date("2026-03-12T12:00:00Z"),
  },
}

/** The calls of a period: Anna Rossi, 4 calls */
export const annaCalls: CallStats = {
  rows: [
    {
      operatorId: 1,
      name: "Anna",
      surname: "Rossi",
      calls: 4,
      answered: 3,
      appointments: 1,
      noAnswer: 1,
    },
  ],
  totals: { calls: 4, answered: 3, appointments: 1, noAnswer: 1 },
}

/** A period without calls */
export const noCalls: CallStats = {
  rows: [],
  totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
}

/**
 * A backend in memory for the home of the dashboard: the cards of
 * `analytics`, the calls of `export` and the practices updated last of
 * `pratiche`, with what each call asked for
 */
export function fakeHome(
  initial: {
    total?: Omit<FinancedOverWindows, "windows">
    average?: Omit<FinancedOverWindows, "windows">
    branches?: BranchTotal[]
    progress?: { done: number; todo: number }
    calls?: CallStats
    rows?: PracticeListRow[]
  } = {}
) {
  const state = {
    total: initial.total ?? { reference: 150_000, comparison: 100_000 },
    average: initial.average ?? { reference: 5_000, comparison: 4_000 },
    branches: initial.branches ?? [{ data: "Roma", total: 150_000 }],
    progress: initial.progress ?? { done: 3, todo: 1 },
    calls: initial.calls ?? annaCalls,
    rows: initial.rows ?? [practiceRow()],
    // The time frame of each read of a card
    totalReads: [] as TimeFrame[],
    averageReads: [] as TimeFrame[],
    branchReads: [] as TimeFrame[],
    progressReads: 0,
    // The period of each read of the calls
    callReads: [] as Array<{ from: string; to: string }>,
    searches: [] as PracticeListQuery[],
    // The cards don't answer: a 500
    failingCards: false,
    // The calls don't answer: a 500
    failingCalls: false,
    // The branches answer once this settles (`holdBranches`)
    branchesHeld: undefined as Promise<void> | undefined,
  }

  const card = <A>(read: () => A) =>
    Effect.suspend(() =>
      state.failingCards ? Effect.die("backend down") : Effect.succeed(read())
    )

  const handlers: FakeHandlers<
    | GroupService<"analytics">
    | GroupService<"export">
    | GroupService<"pratiche">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "analytics", (handlers) =>
      handlers
        .handle("getFinancedTotal", ({ query }) =>
          card(() => {
            state.totalReads.push(query.timeFrame ?? "30d")
            return { ...state.total, windows: homeWindows }
          })
        )
        .handle("getFinancedAverage", ({ query }) =>
          card(() => {
            state.averageReads.push(query.timeFrame ?? "30d")
            return { ...state.average, windows: homeWindows }
          })
        )
        .handle("getFinancedByBranch", ({ query }) =>
          Effect.promise(() => state.branchesHeld ?? Promise.resolve()).pipe(
            Effect.andThen(
              card(() => {
                state.branchReads.push(query.timeFrame ?? "30d")
                return state.branches
              })
            )
          )
        )
        .handle("getContactProgress", () =>
          card(() => {
            state.progressReads++
            return state.progress
          })
        )
        .handle("getFinancedSeries", unserved)
        .handle("getBranchTotals", unserved)
        .handle("getCallsByOperator", unserved)
        .handle("getMyCallSeries", unserved)
    ),
    HttpApiBuilder.group(MitoApi, "export", (handlers) =>
      handlers.handle("callStats", ({ query }) =>
        Effect.suspend(() => {
          state.callReads.push(query)
          if (state.failingCalls) return Effect.die("backend down")
          return Effect.succeed(state.calls)
        })
      )
    ),
    HttpApiBuilder.group(MitoApi, "pratiche", (handlers) =>
      handlers
        .handle("getAllPratiche", ({ payload }) =>
          Effect.sync(() => {
            state.searches.push(payload)
            return { total: [{ total: state.rows.length }], data: state.rows }
          })
        )
        .handle("getAllAvailableRegion", unserved)
        .handle("createPratica", unserved)
        .handle("getPraticaById", unserved)
        .handle("updatePraticaFromDashboard", unserved)
        .handle("updateCustomerPreview", unserved)
    )
  )
  /** Holds the answers of the branches until the function it returns runs */
  const holdBranches = () => {
    let resolve: (() => void) | undefined
    state.branchesHeld = new Promise((settle) => {
      resolve = settle
    })
    return () => {
      state.branchesHeld = undefined
      resolve?.()
    }
  }

  return { state, handlers, holdBranches }
}
