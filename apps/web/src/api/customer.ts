import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Effect } from "effect"
import {
  type BlackListStatus,
  type CustomerListQuery,
} from "@mito/contract/customer"
import { useRun } from "./ApiProvider"
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
}

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
 * the Next.js app keeps the page during a navigation; when there is none, a
 * failure goes to the error of the route
 */
export const useCustomerList = (query: CustomerListQuery) =>
  useQuery({
    ...customerListOptions(useRun(), query),
    placeholderData: keepPreviousData,
    throwOnError: (_error, failed) => failed.state.data === undefined,
  })

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

/** The sedi of the customers (`GET /customer/options/sedi`) */
export const useSedi = () =>
  useQuery(
    optionQuery(useRun(), customerKeys.sedi(), (client) =>
      client.customer.getAllAvaliableSede()
    )
  )

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
 * then the lists and the details of the customers are read again, the
 * blacklist of the profile with them (§6)
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
 * when they end the customers and the tasks are read again, the ones of the
 * batches that went through too (§6)
 */
export const useBulkAssignCustomers = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      batches: readonly { operatorId: number; customerIds: readonly string[] }[]
    ) =>
      Promise.all(
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
