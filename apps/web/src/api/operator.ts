import { queryOptions, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { routeErrorWhenEmpty } from "./queryClient"
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
 * The operators a contact can be given to, for a page that needs them to
 * render (the detail of a contact, for the admin): read only when `enabled`,
 * and a failure with none on screen goes to the error of the route. Only a
 * failure of a read after the page mounted: TanStack Query doesn't ask again
 * on mount a query that throws to the route, and another page (a filter, a
 * form) may have left a failed read of the same key in the cache
 */
export const useAssignableOperators = ({ enabled }: { enabled: boolean }) => {
  const [mountedAt] = useState(Date.now)
  return useQuery({
    ...activeOperatorsOptions(useRun()),
    enabled,
    meta: routeErrorWhenEmpty.meta,
    throwOnError: (_error, query) =>
      query.state.data === undefined && query.state.errorUpdatedAt >= mountedAt,
  })
}

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
