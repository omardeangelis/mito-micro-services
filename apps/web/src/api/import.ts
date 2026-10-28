import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useMemo } from "react"
import { Effect } from "effect"
import { type ImportSummary } from "@mito/contract/import"
import { type ImportClient } from "@mito/client/import/upload"
import { type LookupKeys } from "@mito/domain/import/payload"
import { useRun } from "./ApiProvider"
import { ApiClient } from "./runtime"

export type { ImportSummary }

/** The keys of the group `import`: `[group, endpoint, input]` (H12) */
export const importKeys = {
  all: ["import"] as const,
  active: () => [...importKeys.all, "active"] as const,
  lists: () => [...importKeys.all, "list"] as const,
  list: (page: number) => [...importKeys.lists(), { page }] as const,
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
const writtenGroups = ["customer", "pratiche", "task", "analytics"] as const

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
