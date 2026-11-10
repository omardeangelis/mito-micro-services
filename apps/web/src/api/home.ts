import {
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { Effect } from "effect"
import { type MyCallback } from "@mito/contract/home"
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

/**
 * The keys of the home of the admin, under their own root: the import's
 * `written()` reads all four again with it, and `getMyCallbacks` has a key
 * here that `homeKeys` doesn't share, so the two homes never see each other's
 * cache (AC30, D6)
 */
export const adminHomeKeys = {
  all: ["adminHome"] as const,
  day: () => [...adminHomeKeys.all, "getTeamDay"] as const,
  waves: () => [...adminHomeKeys.all, "getLatestWaves"] as const,
  team: () => [...adminHomeKeys.all, "getTeamDetail"] as const,
  callbacks: () => [...adminHomeKeys.all, "getMyCallbacks"] as const,
}

/**
 * Each part loads and fails on its own, with no toast. The data of before stay
 * until the new ones arrive (the default `gcTime`), and neither the window's
 * focus nor the network coming back reads anything: only a return to the page
 * does (`staleTime: 0`)
 */
const adminPartOptions = {
  meta: { toastErrors: false },
  networkMode: "always",
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 0,
} as const

/** The count of the team today (`GET /home/team/day`) */
const teamDayOptions = (run: Run) =>
  queryOptions({
    ...adminPartOptions,
    queryKey: adminHomeKeys.day(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getTeamDay()
        }),
        signal
      ),
  })

/** The last Waves (`GET /home/waves`) */
const latestWavesOptions = (run: Run) =>
  queryOptions({
    ...adminPartOptions,
    queryKey: adminHomeKeys.waves(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getLatestWaves()
        }),
        signal
      ),
  })

/** The daily detail of the team (`GET /home/team`) */
const teamDetailOptions = (run: Run) =>
  queryOptions({
    ...adminPartOptions,
    queryKey: adminHomeKeys.team(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getTeamDetail()
        }),
        signal
      ),
  })

/** The callbacks of the admin (`GET /home/callbacks`), in the admin's cache */
const adminCallbacksOptions = (run: Run) =>
  queryOptions({
    ...adminPartOptions,
    queryKey: adminHomeKeys.callbacks(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.home.getMyCallbacks()
        }),
        signal
      ),
  })

/** Overdue rows have `daysLate > 0`, today's have 0; a module function, so `select` stays stable */
const splitCallbacks = (rows: ReadonlyArray<MyCallback>) => ({
  overdue: rows.filter((row) => row.daysLate > 0),
  today: rows.filter((row) => row.daysLate === 0),
})

export const useTeamDay = () => useQuery(teamDayOptions(useRun()))
export const useLatestWaves = () => useQuery(latestWavesOptions(useRun()))
export const useTeamDetail = () => useQuery(teamDetailOptions(useRun()))
export const useAdminCallbacks = () =>
  useQuery({ ...adminCallbacksOptions(useRun()), select: splitCallbacks })

/**
 * Reads the four parts of the admin's home again. The function is the same
 * between two renders: an effect can depend on it without starting again
 */
export const useRefreshAdminHome = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: adminHomeKeys.all }),
    [queryClient]
  )
}

/**
 * «Riprova» of a part: the query goes back to its initial state, so every
 * observer of it is pending together and the skeleton comes back, then it
 * reads again. The function is stable
 */
export const useRetryPart = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (queryKey: readonly unknown[]) =>
      queryClient.resetQueries({ queryKey, exact: true }),
    [queryClient]
  )
}
