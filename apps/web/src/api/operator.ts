import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useState } from "react"
import { Effect } from "effect"
import { type RoleChange } from "@mito/contract/operator"
import { useRun } from "./ApiProvider"
import { meKeys } from "./me"
import { routeErrorWhenEmpty } from "./queryClient"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `operator`: `[group, endpoint, input]` (H12) */
export const operatorKeys = {
  all: ["operator"] as const,
  active: () => [...operatorKeys.all, "getAllUniqueOperators"] as const,
  byId: (id: number) =>
    [...operatorKeys.all, "getOperatorById", { id }] as const,
  deactivationImpact: (operatorId: number) =>
    [...operatorKeys.all, "getDeactivationImpact", { operatorId }] as const,
  deactivationTargets: (operatorId: number) =>
    [
      ...operatorKeys.all,
      "getOperatorsForDeactivation",
      { operatorId },
    ] as const,
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
 * render (the detail of a contact, for the admin; the operators of the
 * profile): read only when `enabled`,
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

/**
 * The roles of some operators (`PUT /operator/roles`, admin), all or none:
 * then the operators and the current user, whose role may be one of them, are
 * read again. The table says its failures itself
 */
export const useUpdateOperatorsRole = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: ReadonlyArray<typeof RoleChange.Type>) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.updateOperatorsRole({
            payload: changes,
          })
        })
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: operatorKeys.all }),
        queryClient.invalidateQueries({ queryKey: meKeys.all }),
      ]),
    meta: { toastErrors: false },
  })
}

/**
 * What a deactivation of `operatorId` would move (`GET
 * /operator/:operatorId/deactivation`, admin), read while the dialog is
 * open. The dialog says itself when it doesn't load
 */
export const useDeactivationImpact = (operatorId: number, enabled: boolean) => {
  const run = useRun()
  return useQuery({
    queryKey: operatorKeys.deactivationImpact(operatorId),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.getDeactivationImpact({
            params: { operatorId },
          })
        }),
        signal
      ),
    enabled,
    meta: { toastErrors: false },
  })
}

/**
 * Who can get the customers of `operatorId` (`GET
 * /operator/:operatorId/deactivation/targets`, admin), as the impact
 */
export const useOperatorsForDeactivation = (
  operatorId: number,
  enabled: boolean
) => {
  const run = useRun()
  return useQuery({
    queryKey: operatorKeys.deactivationTargets(operatorId),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.getOperatorsForDeactivation({
            params: { operatorId },
          })
        }),
        signal
      ),
    enabled,
    meta: { toastErrors: false },
  })
}

/** The groups whose data a deactivation moves to another operator */
const movedGroups = ["customer", "task", "pratiche", "analytics"] as const

/**
 * The deactivation of an operator, whose customers, active contacts and
 * practices go to `toOperatorId` (`POST /operator/:operatorId/deactivation`,
 * admin): then the operators and what moved are read again. The dialog says
 * its failures itself
 */
export const useDeactivateOperator = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      operatorId,
      toOperatorId,
    }: {
      operatorId: number
      toOperatorId: number
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.operator.deactivate({
            params: { operatorId },
            payload: { toOperatorId },
          })
        })
      ),
    // Not awaited: the dialog closes before the row of the operator goes
    onSuccess: () => {
      for (const queryKey of [
        operatorKeys.all,
        ...movedGroups.map((group) => [group]),
      ])
        void queryClient.invalidateQueries({ queryKey })
    },
    meta: { toastErrors: false },
  })
}
