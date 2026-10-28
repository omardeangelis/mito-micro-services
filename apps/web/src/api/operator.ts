import { queryOptions, useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `operator`: `[group, endpoint, input]` (H12) */
export const operatorKeys = {
  all: ["operator"] as const,
  active: () => [...operatorKeys.all, "getAllUniqueOperators"] as const,
}

/** The active operators, with their role (`GET /operator`) */
export const activeOperatorsOptions = (run: Run) =>
  queryOptions({
    queryKey: operatorKeys.active(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.getAllUniqueOperators()
        }),
        signal
      ),
  })

export const useActiveOperators = () =>
  useQuery(activeOperatorsOptions(useRun()))
