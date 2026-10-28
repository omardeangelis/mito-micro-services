import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { Effect } from "effect"
import { type PracticeState } from "@mito/contract/customer"
import {
  type CustomerPreview,
  type NewPratica,
  type PracticeListQuery,
} from "@mito/contract/pratiche"
import { useRun } from "./ApiProvider"
import { customerKeys } from "./customer"
import { routeErrorWhenEmpty, showApiError } from "./queryClient"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `pratiche`: `[group, endpoint, input]` (H12) */
export const praticheKeys = {
  all: ["pratiche"] as const,
  list: (query: PracticeListQuery) =>
    [...praticheKeys.all, "getAllPratiche", query] as const,
  regions: () => [...praticheKeys.all, "getAllAvailableRegion"] as const,
  detail: (id: string) =>
    [...praticheKeys.all, "getPraticaById", { id }] as const,
}

/** One page of the practices list (`POST /pratiche/search`) */
export const practiceListOptions = (run: Run, query: PracticeListQuery) =>
  queryOptions({
    queryKey: praticheKeys.list(query),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.getAllPratiche({ payload: query })
        }),
        signal
      ),
  })

type PracticeListData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof practiceListOptions>["queryFn"]>>
>

/**
 * The page of `query`, as `useCustomerList`: while another page loads the
 * previous one stays; if that page fails, the last page shown stays too,
 * with the toast. When no page was shown yet, a failure goes to the error of
 * the route, with no toast
 */
export const usePracticeList = (query: PracticeListQuery) => {
  // The last page on screen: a failed page has no data of its own, and
  // `keepPreviousData` keeps the previous one only while it loads
  const shown = useRef<PracticeListData | undefined>(undefined)
  const result = useQuery({
    ...practiceListOptions(useRun(), query),
    placeholderData: keepPreviousData,
    meta: { toastErrors: false },
    throwOnError: () => shown.current === undefined,
  })
  if (result.data !== undefined) shown.current = result.data
  // The toast of a later page, once per failure
  const { error, errorUpdatedAt } = result
  useEffect(() => {
    if (error && shown.current !== undefined) showApiError(error)
  }, [error, errorUpdatedAt])
  return { ...result, data: result.data ?? shown.current }
}

/**
 * A practice, by its `praticaId` (`GET /pratiche/by-pratica-id/:id`). One
 * that doesn't exist stays in the page, as `notFound()` of the Next.js app;
 * any other first failure goes to the error of the route
 */
export const usePractice = (id: string) => {
  const run = useRun()
  return useQuery({
    queryKey: praticheKeys.detail(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.getPraticaById({ params: { id } })
        }),
        signal
      ),
    meta: { toastErrors: "withData" },
    throwOnError: (error, query) =>
      query.state.data === undefined && error._tag !== "PracticeNotFound",
  })
}

/**
 * "Modifica" of the detail of a practice (`PATCH /pratiche/:id/state`): then
 * the practices are read again, as `revalidatePath` of the server action. A
 * failure shows its toast
 */
export const useUpdatePracticeState = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, state }: { id: number; state: PracticeState }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.updatePraticaFromDashboard({
            params: { id },
            payload: { state },
          })
        })
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: praticheKeys.all }),
  })
}

/**
 * "Salva" of a customer in the detail of a practice
 * (`PATCH /pratiche/customer-preview/:id`): its email and phone number. Then
 * the customers are read again. No toast of its own: the form says the
 * failure with the text of the server action
 */
export const useUpdateCustomerPreview = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    meta: { toastErrors: false },
    mutationFn: ({ id, values }: { id: string; values: CustomerPreview }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.updateCustomerPreview({
            params: { id },
            payload: values,
          })
        })
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

/**
 * The regions of the practices (`GET /pratiche/regions`), for the form of a
 * new practice: its first failure goes to the error of the route
 */
export const useRegions = () => {
  const run = useRun()
  return useQuery({
    ...routeErrorWhenEmpty,
    queryKey: praticheKeys.regions(),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.getAllAvailableRegion()
        }),
        signal
      ),
  })
}

/**
 * "Nuova pratica" (`POST /pratiche`): the practice, its holder and the new
 * customers. Then the customers and the practices are read again (§6). No
 * toast: the form shows the error under "ID Pratica", as the Next.js app
 */
export const useCreatePratica = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    meta: { toastErrors: false },
    mutationFn: (payload: NewPratica) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.pratiche.createPratica({ payload })
        })
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.all }),
        queryClient.invalidateQueries({ queryKey: praticheKeys.all }),
      ]),
  })
}
