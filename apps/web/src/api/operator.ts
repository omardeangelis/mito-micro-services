import { queryOptions, useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `operator`: `[group, endpoint, input]` (H12) */
export const operatorKeys = {
  all: ["operator"] as const,
  active: () => [...operatorKeys.all, "getAllUniqueOperators"] as const,
  byId: (id: number) =>
    [...operatorKeys.all, "getOperatorById", { id }] as const,
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

/**
 * An operator by id, null when there is none (`GET /operator/:id`): the
 * author of a note. Only an id an operator can have is looked up, and a
 * failure leaves the note without a name, no toast
 */
export const useOperator = (id: number) => {
  const run = useRun()
  return useQuery({
    queryKey: operatorKeys.byId(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.getOperatorById({ params: { id } })
        }),
        signal
      ),
    enabled: Number.isInteger(id) && id > 0 && id <= 2_147_483_647,
    meta: { toastErrors: false },
  })
}
