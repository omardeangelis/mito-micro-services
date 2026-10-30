import { useCallback, useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "react-router"
import { type Role } from "@mito/contract/schemas"
import { type DayRange } from "@mito/domain/analytics/window"
import { romeDay } from "@mito/domain/contact/time"
import { callsCompleteSince } from "@mito/domain/export/period"
import {
  type AnalysisScope,
  useBranchTotals,
  useCallsByOperator,
  useContactProgressNow,
  useFinancedSeries,
  useMyCallSeries,
  useRoleChangeGuard,
} from "@/api/analytics"
import { type ApiFailure } from "@/api/errors"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { type TrendInput } from "../_lib/calls"
import { type ChartId, chartsFor } from "../_lib/charts"
import {
  type BranchPoint,
  type OperatorCallsPoint,
  type OperatorRatePoint,
  type ProgressPoint,
  adminAppointmentsResult,
  adminCallsResult,
  branchesResult,
  progressResult,
} from "../_lib/rankings"
import {
  CHART_QUESTIONS,
  CHART_TITLES,
  type ChartResult,
} from "../_lib/results"
import {
  type CallsPoint,
  type RatePoint,
  type TrendPoint,
  MY_APPOINTMENTS_QUESTION,
  MY_CALLS_QUESTION,
  averageResult,
  financedResult,
  myAppointmentsResult,
  myCallsResult,
  scopeOf,
} from "../_lib/trends"
import { type PageState, readState, writeState } from "../_lib/urlState"

/**
 * The chart a result draws, by its shape: the operator's call charts are in
 * time (AC18), the admin's are rankings (AC3)
 */
export type Drawn =
  | { shape: "financed"; result: ChartResult<TrendPoint> }
  | { shape: "average"; result: ChartResult<TrendPoint> }
  | { shape: "branches"; result: ChartResult<BranchPoint> }
  | { shape: "progress"; result: ChartResult<ProgressPoint> }
  | { shape: "adminCalls"; result: ChartResult<OperatorCallsPoint> }
  | { shape: "adminAppointments"; result: ChartResult<OperatorRatePoint> }
  | { shape: "myCalls"; result: ChartResult<CallsPoint> }
  | { shape: "myAppointments"; result: ChartResult<RatePoint> }

type Shape = Drawn["shape"]

/** The result `shape` draws */
type ResultOf<S extends Shape> = Extract<Drawn, { shape: S }>["result"]

/** The window an answer is for, and the one it is compared with (AC30) */
type Answered = { window: DayRange; comparison: DayRange | null }

/**
 * What a chart of the page shows: loading until the data of the chosen window
 * arrives (AC26), its own error (D10), the expired session (AC23, which is
 * not a chart's error: the app's flow of the session says it), or the result
 * with the `window` and `comparison` of the answer that produced it, which a
 * file is named and headed by (AC30)
 */
export type ChartState =
  | { kind: "loading" }
  | { kind: "error"; error: ApiFailure; retry: () => void }
  | { kind: "session" }
  | ({ kind: "result" } & Answered & Drawn)

/** A chart of the page: its tab, its panel, and later its export */
export type ChartView = {
  id: ChartId
  title: string
  /** A chart in time: sparkline in the tab, «Raggruppa per» (AC2, AC18) */
  inTime: boolean
  /** The question under the title: known without data, so the loading state reserves its line (AC19) */
  question: string
  /** Whose numbers they are (AC6), known without data; null for all of them */
  scope: string | null
  state: ChartState
}

/** The questions under the titles of `role`: the operator's call charts have their own (AC18) */
const QUESTIONS: Record<Role, Record<ChartId, string>> = {
  ADMIN: CHART_QUESTIONS,
  OPERATORE: {
    ...CHART_QUESTIONS,
    calls: MY_CALLS_QUESTION,
    appointments: MY_APPOINTMENTS_QUESTION,
  },
}

/** The charts in time for `role` (AC2, AC18) */
const inTimeFor = (id: ChartId, role: Role) =>
  id === "financed" ||
  id === "average" ||
  (role === "OPERATORE" && (id === "calls" || id === "appointments"))

type Query<D> = {
  data: D | undefined
  error: ApiFailure | null
  refetch: () => unknown
}

/**
 * The parts of a query a chart reads, with the identity of their values:
 * `useQuery` hands out a new result object on every render, so the views are
 * rebuilt only when `data` or `error` change
 */
function useStableQuery<D>(query: Query<D>): Query<D> {
  const { data, error, refetch } = query
  return useMemo(() => ({ data, error, refetch }), [data, error, refetch])
}

const ownWindow = ({ window, comparison }: Answered): Answered => ({
  window,
  comparison,
})

/**
 * The state of a chart from its query. A `NotAdmin` is the role that changed
 * under the page (AC23): the guard reads the user again and the chart goes to
 * the operator's view, so it stays loading instead of showing an error box. An
 * `Unauthorized` is the session that expired, not a chart's error (AC23).
 * The window of the result is the data's own, `answered` says otherwise
 */
function stateOf<D extends Answered, S extends Shape>(
  query: Query<D>,
  shape: S,
  build: (data: D) => ResultOf<S>
): ChartState
function stateOf<D, S extends Shape>(
  query: Query<D>,
  shape: S,
  build: (data: D) => ResultOf<S>,
  answered: (data: D) => Answered
): ChartState
function stateOf<D, S extends Shape>(
  query: Query<D>,
  shape: S,
  build: (data: D) => ResultOf<S>,
  answered: (data: D) => Answered = ownWindow as (data: D) => Answered
): ChartState {
  if (query.error !== null) {
    if (query.error._tag === "NotAdmin") return { kind: "loading" }
    if (query.error._tag === "Unauthorized") return { kind: "session" }
    return {
      kind: "error",
      error: query.error,
      retry: () => void query.refetch(),
    }
  }
  if (query.data === undefined) return { kind: "loading" }
  // `build` returns the result of `shape`, which TypeScript can't see through `S`
  const drawn = { shape, result: build(query.data) } as Drawn
  return { kind: "result", ...answered(query.data), ...drawn }
}

/**
 * The analysis page's state and data: the window of the address (AC14), the
 * queries of the window for who asks (D11), and a `ChartView` for each chart
 * the role can see (AC3). `state` is undefined until the role is known
 */
export function useAnalisi() {
  const role = useUserPreferenceContext((s) => s.role)
  const operatorId = useUserPreferenceContext((s) => s.operatorId)
  const location = useLocation()
  const navigate = useNavigate()

  const now = new Date()
  const today = romeDay(now)
  const completeSince = callsCompleteSince(now)

  const state = useMemo(
    () =>
      role === undefined ? undefined : readState(location.search, today, role),
    [location.search, today, role]
  )

  // The address always says the whole state, without new entries (AC14)
  const write = useCallback(
    (next: PageState) =>
      void navigate(
        { pathname: location.pathname, search: `?${writeState(next)}` },
        { replace: true }
      ),
    [navigate, location.pathname]
  )
  useEffect(() => {
    if (state !== undefined && location.search !== `?${writeState(state)}`)
      write(state)
  }, [state, location.search, write])

  // `state` is there exactly when the role is
  const scope: AnalysisScope | undefined =
    role === undefined || operatorId === undefined
      ? undefined
      : { role, operatorId }
  const query = {
    from: state?.window.from ?? today,
    to: state?.window.to ?? today,
    compare: state?.compare ?? "none",
  }
  const financed = useFinancedSeries(query, scope)
  const branches = useBranchTotals(query, scope)
  const calls = useCallsByOperator(query, scope)
  const myCalls = useMyCallSeries(query, scope)
  const progress = useContactProgressNow(scope)
  useRoleChangeGuard([branches.error, calls.error])

  const financedQuery = useStableQuery(financed)
  const branchesQuery = useStableQuery(branches)
  const callsQuery = useStableQuery(calls)
  const myCallsQuery = useStableQuery(myCalls)
  const progressQuery = useStableQuery(progress)

  const views = useMemo((): ChartView[] => {
    if (state === undefined || role === undefined) return []
    const input = <D>(data: D): TrendInput<D> => ({
      data,
      range: state.range,
      compare: state.compare,
      group: state.group,
      role,
      completeSince,
    })
    // A snapshot of now: its window is today alone (AC7)
    const snapshot: Answered = {
      window: { from: today, to: today },
      comparison: null,
    }
    const states: Record<ChartId, () => ChartState> = {
      financed: () =>
        stateOf(financedQuery, "financed", (data) =>
          financedResult(input(data))
        ),
      average: () =>
        stateOf(financedQuery, "average", (data) => averageResult(input(data))),
      branches: () =>
        stateOf(branchesQuery, "branches", (data) =>
          branchesResult(input(data))
        ),
      progress: () =>
        stateOf(
          progressQuery,
          "progress",
          (data) => progressResult({ data }),
          () => snapshot
        ),
      ...{
        ADMIN: {
          calls: () =>
            stateOf(callsQuery, "adminCalls", (data) =>
              adminCallsResult(input(data))
            ),
          appointments: () =>
            stateOf(callsQuery, "adminAppointments", (data) =>
              adminAppointmentsResult(input(data))
            ),
        },
        OPERATORE: {
          calls: () =>
            stateOf(myCallsQuery, "myCalls", (data) =>
              myCallsResult(input(data))
            ),
          appointments: () =>
            stateOf(myCallsQuery, "myAppointments", (data) =>
              myAppointmentsResult(input(data))
            ),
        },
      }[role],
    }
    return chartsFor(role).map((id) => ({
      id,
      title: CHART_TITLES[id],
      inTime: inTimeFor(id, role),
      question: QUESTIONS[role][id],
      scope: id === "financed" || id === "average" ? scopeOf(role) : null,
      state: states[id](),
    }))
  }, [
    state,
    role,
    today,
    completeSince,
    financedQuery,
    branchesQuery,
    callsQuery,
    myCallsQuery,
    progressQuery,
  ])

  /** Shows another chart; the rest of the state stays (AC14) */
  const select = useCallback(
    (chart: ChartId) => {
      if (state !== undefined && chart !== state.chart)
        write({ ...state, chart })
    },
    [state, write]
  )

  return { role, state, today, views, select, write }
}
