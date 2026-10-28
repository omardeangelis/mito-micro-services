import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/use-toast"
import { describeApiError } from "./errors"
import { type ApiFailure, ApiUnavailable } from "./runtime"

declare module "@tanstack/react-query" {
  // What `run` rejects with: the `error` of every query and mutation
  interface Register {
    defaultError: ApiFailure
  }
}

/** The toast of a failed call, with its text */
export const showApiError = (error: ApiFailure) => {
  toast({ variant: "destructive", title: describeApiError(error) })
}

/**
 * The `QueryClient` of the app (H12): the defaults of tRPC today (`staleTime`
 * 0, the refetch on focus), but a retry only when the backend didn't answer,
 * since a declared error answers the same the second time. A failed call
 * shows its text in the toast
 */
export const makeQueryClient = () =>
  new QueryClient({
    // A query with `meta.toastErrors: false` shows its failures itself
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.toastErrors !== false) showApiError(error)
      },
    }),
    mutationCache: new MutationCache({ onError: showApiError }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          error instanceof ApiUnavailable && failures < 3,
      },
    },
  })
