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
    // A query with `meta.toastErrors: false` shows its failures itself; one
    // with "withData" only when it has data, since without it goes to the
    // error of the route (`routeErrorWhenEmpty`)
    queryCache: new QueryCache({
      onError: (error, query) => {
        const toastErrors = query.meta?.toastErrors
        if (toastErrors === false) return
        if (toastErrors === "withData" && query.state.data === undefined) return
        showApiError(error)
      },
    }),
    // A mutation with `meta.toastErrors: false` shows its failures itself
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        if (mutation.meta?.toastErrors === false) return
        showApiError(error)
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          error instanceof ApiUnavailable && failures < 3,
      },
    },
  })

/**
 * The options of a query a page can't show without: its first failure goes
 * to the error of the route, without a toast; a later one leaves the data on
 * screen, with the toast
 */
export const routeErrorWhenEmpty = {
  meta: { toastErrors: "withData" },
  throwOnError: (_error: unknown, query: { state: { data: unknown } }) =>
    query.state.data === undefined,
} as const
