import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query"
import { Effect } from "effect"
import { useEffect } from "react"
import { type AnalysisQuery, type TimeFrame } from "@mito/contract/analytics"
import { type Role } from "@mito/contract/schemas"
import { useRun } from "./ApiProvider"
import { meKeys } from "./me"
import { routeErrorWhenEmpty } from "./queryClient"
import { ApiClient, type ApiFailure } from "./runtime"

/**
 * The key of a query of the analysis page: it carries who asks (D11), the role
 * and the operator, so a change of either never shows the numbers of the other
 */
const analysisKey = <Endpoint extends string, Input extends object>(
  endpoint: Endpoint,
  input: Input,
  scope: AnalysisScope | undefined
) => ["analytics", endpoint, { ...input, ...scope }] as const

/** The keys of the group `analytics`: `[group, endpoint, input]` (H12) */
export const analyticsKeys = {
  all: ["analytics"] as const,
  financedTotal: (timeFrame: TimeFrame) =>
    [...analyticsKeys.all, "getFinancedTotal", { timeFrame }] as const,
  financedAverage: (timeFrame: TimeFrame) =>
    [...analyticsKeys.all, "getFinancedAverage", { timeFrame }] as const,
  financedByBranch: (timeFrame: TimeFrame) =>
    [...analyticsKeys.all, "getFinancedByBranch", { timeFrame }] as const,
  contactProgress: () => [...analyticsKeys.all, "getContactProgress"] as const,
  // The keys of the analysis page carry who asks (`analysisKey`)
  financedSeries: (query: AnalysisQuery, scope: AnalysisScope | undefined) =>
    analysisKey("getFinancedSeries", { query }, scope),
  branchTotals: (query: AnalysisQuery, scope: AnalysisScope | undefined) =>
    analysisKey("getBranchTotals", { query }, scope),
  callsByOperator: (query: AnalysisQuery, scope: AnalysisScope | undefined) =>
    analysisKey("getCallsByOperator", { query }, scope),
  myCallSeries: (query: AnalysisQuery, scope: AnalysisScope | undefined) =>
    analysisKey("getMyCallSeries", { query }, scope),
  // Not the key of the home's card, whose cache the page leaves alone
  contactProgressNow: (scope: AnalysisScope | undefined) =>
    analysisKey("getContactProgressNow", {}, scope),
}

// The cards of "Analisi Andamento": the page can't show them without their
// numbers, so a first failure goes to the error of the route, as a failed
// server component of the Next.js app (`routeErrorWhenEmpty`). While another
// time frame loads, the row of cards keeps showing the one before
// (`DataSection`)

/** The amount financed in the time frame and in the one before it, summed */
export const useFinancedTotal = (timeFrame: TimeFrame) => {
  const run = useRun()
  return useQuery({
    queryKey: analyticsKeys.financedTotal(timeFrame),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.analytics.getFinancedTotal({
            query: { timeFrame },
          })
        }),
        signal
      ),
    ...routeErrorWhenEmpty,
  })
}

/** The amount financed in the time frame and in the one before it, averaged */
export const useFinancedAverage = (timeFrame: TimeFrame) => {
  const run = useRun()
  return useQuery({
    queryKey: analyticsKeys.financedAverage(timeFrame),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.analytics.getFinancedAverage({
            query: { timeFrame },
          })
        }),
        signal
      ),
    ...routeErrorWhenEmpty,
  })
}

/** The amount financed in the time frame by each point of sale: admins only */
export const useFinancedByBranch = (timeFrame: TimeFrame) => {
  const run = useRun()
  return useQuery({
    queryKey: analyticsKeys.financedByBranch(timeFrame),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.analytics.getFinancedByBranch({
            query: { timeFrame },
          })
        }),
        signal
      ),
    ...routeErrorWhenEmpty,
  })
}

/** "Contatti con esito": the active contacts with an outcome, and to call */
export const useContactProgress = () => {
  const run = useRun()
  return useQuery({
    queryKey: analyticsKeys.contactProgress(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.analytics.getContactProgress()
        }),
        signal
      ),
    ...routeErrorWhenEmpty,
  })
}

// The charts of the analysis page: each one fails on its own, in its own box,
// never to the error of the route (D10). No `placeholderData`: while the data
// of the chosen window hasn't arrived the chart is loading, never showing the
// numbers of the window before (AC26). Only an expired session shows a toast,
// once (`toastErrors: "session"`)

/** Who asks the analysis page: the role and the operator the numbers are for */
export type AnalysisScope = { role: Role; operatorId: number }

/** One query of the analysis page: `call` under `key`, run only when `enabled` */
const useAnalysis = <A, E>(
  key: QueryKey,
  call: Effect.Effect<A, E, ApiClient>,
  enabled: boolean
) => {
  const run = useRun()
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => run(call, signal),
    enabled,
    meta: { toastErrors: "session" },
  })
}

/** The amount financed day by day in the window and in its comparison */
export const useFinancedSeries = (
  query: AnalysisQuery,
  scope: AnalysisScope | undefined
) =>
  useAnalysis(
    analyticsKeys.financedSeries(query, scope),
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.analytics.getFinancedSeries({ query })
    }),
    scope !== undefined
  )

/** The amount financed by each point of sale in the window: admins only */
export const useBranchTotals = (
  query: AnalysisQuery,
  scope: AnalysisScope | undefined
) =>
  useAnalysis(
    analyticsKeys.branchTotals(query, scope),
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.analytics.getBranchTotals({ query })
    }),
    scope?.role === "ADMIN"
  )

/** The calls of each operator in the window: admins only */
export const useCallsByOperator = (
  query: AnalysisQuery,
  scope: AnalysisScope | undefined
) =>
  useAnalysis(
    analyticsKeys.callsByOperator(query, scope),
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.analytics.getCallsByOperator({ query })
    }),
    scope?.role === "ADMIN"
  )

/** The own calls day by day in the window: operators only */
export const useMyCallSeries = (
  query: AnalysisQuery,
  scope: AnalysisScope | undefined
) =>
  useAnalysis(
    analyticsKeys.myCallSeries(query, scope),
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.analytics.getMyCallSeries({ query })
    }),
    scope?.role === "OPERATORE"
  )

/** The active contacts with an outcome, and those to call, as of now */
export const useContactProgressNow = (scope: AnalysisScope | undefined) =>
  useAnalysis(
    analyticsKeys.contactProgressNow(scope),
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.analytics.getContactProgress()
    }),
    scope !== undefined
  )

/**
 * The role changed under the open page (AC23): an admin-only chart answered
 * `NotAdmin`. The current user is read again, so the role of the store
 * follows, and the queries of the admin's view leave the cache at once. It
 * runs once for each `NotAdmin`, not at every render
 */
export const useRoleChangeGuard = (
  errors: ReadonlyArray<ApiFailure | null | undefined>
) => {
  const queryClient = useQueryClient()
  const notAdmin = errors.some((error) => error?._tag === "NotAdmin")
  useEffect(() => {
    if (!notAdmin) return
    void queryClient.invalidateQueries({ queryKey: meKeys.current() })
    queryClient.removeQueries({
      predicate: ({ queryKey }) => {
        const [group, , scope] = queryKey
        return (
          group === "analytics" &&
          typeof scope === "object" &&
          scope !== null &&
          "role" in scope &&
          scope.role === "ADMIN"
        )
      },
    })
  }, [notAdmin, queryClient])
}
