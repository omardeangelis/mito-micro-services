import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { Effect } from "effect"
import {
  type BlackListStatus,
  type CustomerCodes,
  type CustomerListQuery,
  type CustomerProfile,
  type NewCustomer,
} from "@mito/contract/customer"
import { useRun } from "./ApiProvider"
import { routeErrorWhenEmpty, showApiError } from "./queryClient"
import { ApiClient, type Run } from "./runtime"
import { taskKeys } from "./task"

/** The keys of the group `customer`: `[group, endpoint, input]` (H12) */
export const customerKeys = {
  all: ["customer"] as const,
  list: (query: CustomerListQuery) =>
    [...customerKeys.all, "getAllCustomers", query] as const,
  comuni: () => [...customerKeys.all, "getAllAvailableComune"] as const,
  sedi: () => [...customerKeys.all, "getAllAvaliableSede"] as const,
  ambiti: () => [...customerKeys.all, "getAllAvailableAmbito"] as const,
  jobs: () => [...customerKeys.all, "getAllAvailableJobs"] as const,
  fileNames: (table: FileTable) =>
    [...customerKeys.all, "getAllFileName", { table }] as const,
  byCode: (codes: CustomerCodesInput) =>
    [...customerKeys.all, "getCustomersByFiscalCodeOrVatCode", codes] as const,
  detail: (id: string) =>
    [...customerKeys.all, "getCustomerById", { id }] as const,
  practices: (id: string) =>
    [...customerKeys.all, "getAllPraticaByCustomer", { id }] as const,
}

/** The codes `getCustomersByFiscalCodeOrVatCode` looks for */
export type CustomerCodesInput = typeof CustomerCodes.Encoded

/** The tables whose import files name the options of the file filter */
export type FileTable = "customers" | "practices"

/** One page of the customers list (`POST /customer/search`) */
export const customerListOptions = (run: Run, query: CustomerListQuery) =>
  queryOptions({
    queryKey: customerKeys.list(query),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.getAllCustomers({ payload: query })
        }),
        signal
      ),
  })

/**
 * The page of `query`. While another page loads the previous one stays, as
 * the Next.js app keeps the page during a navigation; if that page fails,
 * the last page shown stays too, with the toast. When no page was shown yet,
 * a failure goes to the error of the route, with no toast
 */
export const useCustomerList = (query: CustomerListQuery) => {
  // The last page on screen: a failed page has no data of its own, and
  // `keepPreviousData` keeps the previous one only while it loads
  const shown = useRef<CustomerListQueryData | undefined>(undefined)
  const result = useQuery({
    ...customerListOptions(useRun(), query),
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

type CustomerListQueryData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof customerListOptions>["queryFn"]>>
>

/** The options of a filter of the list: an endpoint without input */
const optionQuery = <A, E>(
  run: Run,
  queryKey: readonly unknown[],
  call: (client: ApiClient["Service"]) => Effect.Effect<A, E>
) =>
  queryOptions({
    queryKey,
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* call(client)
        }),
        signal
      ),
  })

/** The comuni of the customers (`GET /customer/options/comuni`) */
export const useComuni = () =>
  useQuery(
    optionQuery(useRun(), customerKeys.comuni(), (client) =>
      client.customer.getAllAvailableComune()
    )
  )

/**
 * The sedi of the customers (`GET /customer/options/sedi`). For a page that
 * can't show without them (`required`), the first failure goes to the error
 * of the route
 */
export const useSedi = ({ required = false } = {}) =>
  useQuery({
    ...optionQuery(useRun(), customerKeys.sedi(), (client) =>
      client.customer.getAllAvaliableSede()
    ),
    ...(required ? routeErrorWhenEmpty : {}),
  })

/** The ambiti of the customers (`GET /customer/options/ambiti`) */
export const useAmbiti = () =>
  useQuery(
    optionQuery(useRun(), customerKeys.ambiti(), (client) =>
      client.customer.getAllAvailableAmbito()
    )
  )

/** The jobs of the customers (`GET /customer/options/jobs`) */
export const useJobs = () =>
  useQuery(
    optionQuery(useRun(), customerKeys.jobs(), (client) =>
      client.customer.getAllAvailableJobs()
    )
  )

/** The import files of `table` (`GET /customer/options/file-names`) */
export const useFileNames = (table: FileTable) =>
  useQuery(
    optionQuery(useRun(), customerKeys.fileNames(table), (client) =>
      client.customer.getAllFileName({ query: { table } })
    )
  )

/**
 * The blacklist status of a customer (`POST /customer/:id/blacklist-status`):
 * then the lists and the details of the customers are read again (§6). The
 * blacklist of the profile joins them with its page (3.8)
 */
export const useSetBlackListStatus = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      customerId,
      blackListStatus,
    }: {
      customerId: string
      blackListStatus: BlackListStatus
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.handleCustomerBlackList({
            params: { id: customerId },
            payload: { blackListStatus },
          })
        })
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

/**
 * The customers of each batch to an operator, without new contacts
 * (`POST /customer/bulk-assign`, admin): the batches go in parallel, and
 * when all of them end, failed or not, the customers and the tasks are read
 * again, the ones of the batches that went through too (§6)
 */
export const useBulkAssignCustomers = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      batches: readonly { operatorId: number; customerIds: readonly string[] }[]
    ) =>
      allBatches(
        batches.map((payload) =>
          run(
            Effect.gen(function* () {
              const client = yield* ApiClient
              return yield* client.customer.bulkUpdateCustomers({ payload })
            })
          )
        )
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
      ]),
  })
}

/**
 * The results of parallel batches once all of them end: the first failure
 * if one failed. `Promise.all` would reject at the first one, and the reads
 * that follow would miss the batches still writing
 */
export const allBatches = async <A>(
  batches: readonly Promise<A>[]
): Promise<A[]> => {
  const results = await Promise.allSettled(batches)
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )
  if (failed) throw failed.reason
  return results.map((result) => (result as PromiseFulfilledResult<A>).value)
}

/** A customer, or null when there is none (`GET /customer/:id`) */
export const customerOptions = (run: Run, id: string) =>
  queryOptions({
    queryKey: customerKeys.detail(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.getCustomerById({ params: { id } })
        }),
        signal
      ),
  })

export const useCustomer = (id: string) =>
  useQuery({ ...customerOptions(useRun(), id), ...routeErrorWhenEmpty })

/** The practices of a customer, with its role (`GET /customer/:id/practices`) */
export const useCustomerPractices = (id: string) =>
  useQuery(
    optionQuery(useRun(), customerKeys.practices(id), (client) =>
      client.customer.getAllPraticaByCustomer({ params: { id } })
    )
  )

/** The customers with one of the codes (`GET /customer/by-code`) */
export const customersByCodeOptions = (run: Run, codes: CustomerCodesInput) =>
  optionQuery(run, customerKeys.byCode(codes), (client) =>
    client.customer.getCustomersByFiscalCodeOrVatCode({ query: codes })
  )

/**
 * Reads the customers with one of the codes, as `ensureData` of tRPC did
 * before a new customer is saved: always from the backend
 */
export const useFindCustomersByCode = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return (codes: CustomerCodesInput) =>
    queryClient.fetchQuery(customersByCodeOptions(run, codes))
}

/**
 * A new customer of whoever creates it (`POST /customer`): then the lists of
 * the customers are read again
 */
export const useInsertCustomer = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NewCustomer) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.insertCustomer({ payload })
        })
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

/**
 * The master data of a customer (`PATCH /customer/:id`): then its detail and
 * the lists of the customers are read again (§6)
 */
export const useUpdateCustomer = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, profile }: { id: string; profile: CustomerProfile }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.updateCustomerFromDashboard({
            params: { id },
            payload: profile,
          })
        })
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

/**
 * "Passaggio di consegne" (`POST /customer/:id/handover`): the customer and
 * its active contact go to another operator. The caller reads the page again
 * (`refresh`), on success and on a rejection alike
 */
export const useHandover = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      customerId,
      toOperatorId,
    }: {
      customerId: string
      toOperatorId: number
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.handover({
            params: { id: customerId },
            payload: { toOperatorId },
          })
        })
      ),
  })
}

/**
 * "Assegna a te" (`POST /customer/:id/assign-to-yourself`). The caller reads
 * the page again (`refresh`), on success and on a rejection alike
 */
export const useAssignToYourself = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.assignToYourself({ params: { id } })
        })
      ),
  })
}

/**
 * The customer's last edit is now (`POST /customer/:id/mark-updated`), after
 * a note is sent or deleted. Nothing to show when it fails
 */
export const useUpdateLastEdit = () => {
  const run = useRun()
  return useMutation({
    mutationKey: [...customerKeys.all, "updateLastEdit"],
    mutationFn: ({ id }: { id: string }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.customer.updateLastEdit({ params: { id } })
        })
      ),
    meta: { toastErrors: false },
  })
}
