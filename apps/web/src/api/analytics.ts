import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { type TimeFrame } from "@mito/contract/analytics"
import { useRun } from "./ApiProvider"
import { routeErrorWhenEmpty } from "./queryClient"
import { ApiClient } from "./runtime"

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
}

// The cards of "Analisi Andamento": the page can't show them without their
// numbers, so a first failure goes to the error of the route, as a failed
// server component of the Next.js app (`routeErrorWhenEmpty`). While another
// time frame loads, the cards keep the numbers of the one before, as the
// transition of the Next.js app did

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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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
