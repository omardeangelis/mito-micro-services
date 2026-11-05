import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Effect } from "effect"
import { type UpdateOperatorInfo } from "@mito/contract/me"
import { useRun } from "./ApiProvider"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `me`: `[group, endpoint, input]` (H12) */
export const meKeys = {
  all: ["me"] as const,
  current: () => [...meKeys.all, "getCurrentUser"] as const,
}

/** The current user: role, operator and preferences (`GET /me`) */
export const currentUserOptions = (run: Run) =>
  queryOptions({
    queryKey: meKeys.current(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.me.getCurrentUser()
        }),
        signal
      ),
  })

export const useCurrentUser = () => useQuery(currentUserOptions(useRun()))

/**
 * The current user, without reading it again as the page mounts: with a failed
 * `GET /me` that read would put the query back to pending, and every page that
 * opens would ask again what the return to the tab asks anyway
 */
export const useKnownCurrentUser = () =>
  useQuery({ ...currentUserOptions(useRun()), retryOnMount: false })

/** The own name and surname (`PATCH /me`): then the current user is read again */
export const useUpdateOperatorInfo = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: typeof UpdateOperatorInfo.Type) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.me.updateOperatorInfo({ payload })
        })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  })
}
