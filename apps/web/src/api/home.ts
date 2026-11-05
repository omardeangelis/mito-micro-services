import {
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { ApiClient, type Run } from "./runtime"

/**
 * The keys of the group `home`, outside `taskKeys.all`: the rows are read
 * once and kept, «Fatti oggi», «Il mio oggi» and «Da chiamare» are read again
 * after a call (AC23, AC35)
 */
export const homeKeys = {
  all: ["home"] as const,
  rows: () => [...homeKeys.all, "rows"] as const,
  callbacks: () => [...homeKeys.rows(), "getMyCallbacks"] as const,
  today: () => [...homeKeys.all, "today"] as const,
  calls: () => [...homeKeys.today(), "getMyCalls"] as const,
  day: () => [...homeKeys.today(), "getMyDay"] as const,
  toCall: () => [...homeKeys.today(), "getMyToCall"] as const,
}

let tick = 0

/**
 * A counter that only grows, not the clock: the page compares the `readTick`
 * of a read with the `respondedTick` of a row to know which one is newer
 */
export const nextTick = () => ++tick

/** Each part fails on its own, shows no toast and leaves nothing in the cache */
const partOptions = {
  meta: { toastErrors: false },
  gcTime: 0,
  networkMode: "always",
  refetchOnReconnect: true,
} as const

/** The callbacks of the current user (`GET /home/callbacks`) and when it was read */
const myCallbacksOptions = (run: Run) =>
  queryOptions({
    ...partOptions,
    queryKey: homeKeys.callbacks(),
    queryFn: async ({ signal }) => {
      // Taken as the read starts: a response that came later is newer
      const readTick = nextTick()
      const rows = await run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getMyCallbacks()
        }),
        signal
      )
      return { rows, readTick }
    },
  })

/** The calls the current user registered today (`GET /home/calls`) */
const myCallsOptions = (run: Run) =>
  queryOptions({
    ...partOptions,
    queryKey: homeKeys.calls(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getMyCalls()
        }),
        signal
      ),
  })

/** The count of the day of the current user (`GET /home/day`) */
const myDayOptions = (run: Run) =>
  queryOptions({
    ...partOptions,
    queryKey: homeKeys.day(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getMyDay()
        }),
        signal
      ),
  })

/** The contacts still to call (`GET /home/to-call`) */
const myToCallOptions = (run: Run) =>
  queryOptions({
    ...partOptions,
    queryKey: homeKeys.toCall(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getMyToCall()
        }),
        signal
      ),
  })

export const useMyCallbacks = () => useQuery(myCallbacksOptions(useRun()))
export const useMyCalls = () => useQuery(myCallsOptions(useRun()))
export const useMyDay = () => useQuery(myDayOptions(useRun()))
export const useMyToCall = () => useQuery(myToCallOptions(useRun()))

/**
 * Reads the three parts of today again, whatever they are doing. They are
 * cancelled first: `invalidateQueries` keeps a read already on its way when
 * the query has no data, and one that started before the call would not see
 * it. The cancelled query goes back to its state and, observed, starts again
 */
export const refreshToday = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: homeKeys.today() })
  await queryClient.invalidateQueries({ queryKey: homeKeys.today() })
}

/**
 * The reads of the home, as stable functions: `refreshAll` reads the four
 * parts again, `refreshRows` only the callbacks
 */
export const useRefreshHome = () => {
  const queryClient = useQueryClient()
  const refreshRows = useCallback(
    () => queryClient.invalidateQueries({ queryKey: homeKeys.rows() }),
    [queryClient]
  )
  const refreshAll = useCallback(
    () => Promise.all([refreshRows(), refreshToday(queryClient)]),
    [queryClient, refreshRows]
  )
  return { refreshAll, refreshRows }
}
