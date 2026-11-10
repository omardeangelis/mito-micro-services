import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query"
import { useMemo } from "react"
import { Effect } from "effect"
import {
  type AssignInput,
  type AssignResult,
  type ImportSummary,
  type MoveCandidates,
  type MoveCandidatesInput,
  type MoveInput,
  type MoveResult,
  type SetDeadlineInput,
  type SetDeadlineResult,
  type WaveView,
} from "@mito/contract/import"
import { type ImportClient } from "@mito/client/import/upload"
import { type LookupKeys } from "@mito/domain/import/payload"
import { analyticsKeys } from "./analytics"
import { useRun } from "./ApiProvider"
import { customerKeys } from "./customer"
import { taskKeys } from "./task"
import { ApiClient, type ApiFailure } from "./runtime"

export type { ImportSummary, WaveView }

/** The keys of the group `import`: `[group, endpoint, input]` (H12) */
export const importKeys = {
  all: ["import"] as const,
  active: () => [...importKeys.all, "active"] as const,
  lists: () => [...importKeys.all, "list"] as const,
  list: (page: number) => [...importKeys.lists(), { page }] as const,
  wave: (id: number) => [...importKeys.all, "wave", id] as const,
}

/** How often the latest import is asked while it runs */
export const IMPORT_POLL_MS = 3000

const running = (run: ImportSummary | null | undefined) =>
  run?.status === "running"

/**
 * The admin's latest import (`GET /import/active`), asked again every 3
 * seconds while it runs and never otherwise, as `import.active` of the Next.js
 * app. A failed ask shows no toast: it's in the background of every page
 */
export const useActiveImport = (enabled: boolean) => {
  const run = useRun()
  return useQuery({
    queryKey: importKeys.active(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.active()
        }),
        signal
      ),
    enabled,
    refetchInterval: (query) =>
      running(query.state.data) ? IMPORT_POLL_MS : false,
    refetchOnWindowFocus: (query) => running(query.state.data),
    meta: { toastErrors: false },
  })
}

/**
 * A page of the history (`GET /import`), keeping the page before while the
 * next one loads. The history says itself when it doesn't load
 */
export const useImportList = (page: number) => {
  const run = useRun()
  return useQuery({
    queryKey: importKeys.list(page),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.list({ query: { page } })
        }),
        signal
      ),
    placeholderData: keepPreviousData,
    meta: { toastErrors: false },
  })
}

/**
 * The calls of a new import, which the page makes one after the other: the
 * lookup of the file's keys, then the parts of the body and the start, in the
 * shape `uploadAndStart` of @mito/client takes. They reject with the error of
 * the contract, which the page says itself
 */
export const useImportClient = () => {
  const run = useRun()
  return useMemo(
    () =>
      ({
        lookup: (keys: LookupKeys) =>
          run(
            Effect.gen(function* () {
              const client = yield* ApiClient
              return yield* client.import.lookup({ payload: keys })
            })
          ),
        upload: {
          mutate: (payload) =>
            run(
              Effect.gen(function* () {
                const client = yield* ApiClient
                return yield* client.import.upload({ payload })
              })
            ),
        },
        start: {
          mutate: (payload) =>
            run(
              Effect.gen(function* () {
                const client = yield* ApiClient
                return yield* client.import.start({ payload })
              })
            ),
        },
      }) satisfies ImportClient & { lookup: unknown },
    [run]
  )
}

/** The groups whose data an import writes */
const writtenGroups = [
  "customer",
  "pratiche",
  "task",
  "analytics",
  "adminHome",
] as const

/** The history and the latest import read again, after a start or an end */
export const useInvalidateImports = () => {
  const queryClient = useQueryClient()
  return useMemo(
    () => ({
      lists: () =>
        queryClient.invalidateQueries({ queryKey: importKeys.lists() }),
      active: () =>
        queryClient.invalidateQueries({ queryKey: importKeys.active() }),
      /**
       * What a completed import wrote, in any page: customers and the "File"
       * filter, practices, contacts and the cards of the home, as
       * `router.refresh()` and `getAllFileName` of the Next.js app
       */
      written: () =>
        Promise.all(
          writtenGroups.map((group) =>
            queryClient.invalidateQueries({ queryKey: [group] })
          )
        ),
    }),
    [queryClient]
  )
}

/**
 * What a Wave's page reads (`GET /import/:id/wave`). A failure shows no toast
 * and the window's focus doesn't read it again: the page says the failure
 * itself and the preview doesn't change while the admin looks at it (D17).
 * No `placeholderData`: another id would show another Wave's numbers
 */
export const useWave = (id: number) => {
  const run = useRun()
  return useQuery({
    queryKey: importKeys.wave(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.wave({ params: { id } })
        }),
        signal
      ),
    refetchOnWindowFocus: false,
    meta: { toastErrors: false },
  })
}

/**
 * The outcome callbacks of a Wave mutation. They go in the options of
 * `useMutation`, not in those of `mutate`: TanStack Query 5 runs the former
 * even after the component unmounted (D18)
 */
export type WaveMutationCallbacks<Data, Variables> = Pick<
  UseMutationOptions<Data, ApiFailure, Variables>,
  "onSuccess" | "onError" | "onSettled"
>

/**
 * A mutation of a Wave: no global toast (the page says the outcome), and on
 * success the Wave and the history are read again before the callback runs
 */
const useWaveMutation = <Data, Variables>(
  id: number,
  mutationFn: (variables: Variables) => Promise<Data>,
  callbacks: WaveMutationCallbacks<Data, Variables> | undefined,
  {
    invalidates,
    also = [],
  }: {
    invalidates: boolean
    /** The caches of other groups that the mutation changes */
    also?: ReadonlyArray<readonly string[]>
  }
) => {
  const queryClient = useQueryClient()
  return useMutation<Data, ApiFailure, Variables>({
    ...callbacks,
    mutationFn,
    meta: { toastErrors: false },
    onSuccess: async (...args) => {
      if (invalidates) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: importKeys.wave(id) }),
          queryClient.invalidateQueries({ queryKey: importKeys.lists() }),
          ...also.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey })
          ),
        ])
      }
      return callbacks?.onSuccess?.(...args)
    },
  })
}

/** The deadline of the Wave (`PATCH /import/:id`) */
export const useSetDeadline = (
  id: number,
  callbacks?: WaveMutationCallbacks<SetDeadlineResult, SetDeadlineInput>
) => {
  const run = useRun()
  return useWaveMutation(
    id,
    (payload: SetDeadlineInput) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.setDeadline({ params: { id }, payload })
        })
      ),
    callbacks,
    { invalidates: true, also: [taskKeys.all] }
  )
}

/** The customers of the Wave without an operator to the receivers (`POST /import/:id/assign`) */
export const useAssign = (
  id: number,
  callbacks?: WaveMutationCallbacks<AssignResult, AssignInput>
) => {
  const run = useRun()
  return useWaveMutation(
    id,
    (payload: AssignInput) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.assign({ params: { id }, payload })
        })
      ),
    callbacks,
    {
      invalidates: true,
      also: [taskKeys.all, customerKeys.all, analyticsKeys.all],
    }
  )
}

/**
 * The contacts the givers could give (`POST /import/:id/move-candidates`): a
 * read, asked again at each new "Avanti" (D7), so it's not cached and nothing
 * is read again after it
 */
export const useMoveCandidates = (
  id: number,
  callbacks?: WaveMutationCallbacks<MoveCandidates, MoveCandidatesInput>
) => {
  const run = useRun()
  return useWaveMutation(
    id,
    (payload: MoveCandidatesInput) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.moveCandidates({
            params: { id },
            payload,
          })
        })
      ),
    callbacks,
    { invalidates: false }
  )
}

/** The contacts of the givers to the receivers (`POST /import/:id/move`) */
export const useMove = (
  id: number,
  callbacks?: WaveMutationCallbacks<MoveResult, MoveInput>
) => {
  const run = useRun()
  return useWaveMutation(
    id,
    (payload: MoveInput) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.import.move({ params: { id }, payload })
        })
      ),
    callbacks,
    {
      invalidates: true,
      also: [taskKeys.all, customerKeys.all, analyticsKeys.all],
    }
  )
}
