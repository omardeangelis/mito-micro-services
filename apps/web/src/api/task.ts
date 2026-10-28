import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Effect } from "effect"
import { type BulkHandleTask } from "@mito/contract/task"
import { useRun } from "./ApiProvider"
import { allBatches, customerKeys } from "./customer"
import { routeErrorWhenEmpty } from "./queryClient"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `task`: `[group, endpoint, input]` (H12) */
export const taskKeys = {
  all: ["task"] as const,
  activeAlerts: (customerIds: readonly string[]) =>
    [...taskKeys.all, "getCustomersWithActiveAlerts", { customerIds }] as const,
  active: (customerId: string) =>
    [...taskKeys.all, "getActiveTask", { id: customerId }] as const,
  customerAlerts: (customerId: string) =>
    [...taskKeys.all, "getCustomerAlerts", { id: customerId }] as const,
  contact: (id: string) => [...taskKeys.all, "getContactById", { id }] as const,
}

/**
 * The customers among `customerIds` with an active alert
 * (`POST /task/active-alerts`)
 */
export const activeAlertsOptions = (run: Run, customerIds: readonly string[]) =>
  queryOptions({
    queryKey: taskKeys.activeAlerts(customerIds),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.getCustomersWithActiveAlerts({
            payload: { customerIds },
          })
        }),
        signal
      ),
  })

export const useCustomersWithActiveAlerts = (
  customerIds: readonly string[],
  { enabled }: { enabled: boolean }
) => useQuery({ ...activeAlertsOptions(useRun(), customerIds), enabled })

/** What `bulkHandleTask` takes for one batch of customers */
export type BulkHandleTaskBatch = typeof BulkHandleTask.Type

/**
 * A contact to call for the customers of each batch, assigned to an operator
 * (`POST /task/bulk-assign`, admin): the batches go in parallel, and when
 * all of them end, failed or not, the customers and the tasks are read
 * again, the ones of the batches that went through too (§6)
 */
export const useBulkHandleTask = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (batches: readonly BulkHandleTaskBatch[]) =>
      allBatches(
        batches.map((payload) =>
          run(
            Effect.gen(function* () {
              const client = yield* ApiClient
              return yield* client.task.bulkHandleTask({ payload })
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

/** The active contact of a customer, or none (`GET /task/by-customer/:id/active`) */
export const useActiveTask = (customerId: string) => {
  const run = useRun()
  return useQuery({
    queryKey: taskKeys.active(customerId),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.getActiveTask({
            params: { id: customerId },
          })
        }),
        signal
      ),
    ...routeErrorWhenEmpty,
  })
}

/**
 * The alerts of a customer, open and closed
 * (`GET /task/by-customer/:id/alerts`)
 */
export const useCustomerAlerts = (
  customerId: string,
  { enabled }: { enabled: boolean }
) => {
  const run = useRun()
  return useQuery({
    queryKey: taskKeys.customerAlerts(customerId),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.getCustomerAlerts({
            params: { id: customerId },
          })
        }),
        signal
      ),
    enabled,
    ...routeErrorWhenEmpty,
  })
}

/** The detail of a contact (`GET /task/:id`) */
export const useContactDetail = (
  id: string,
  { enabled }: { enabled: boolean }
) => {
  const run = useRun()
  return useQuery({
    queryKey: taskKeys.contact(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.getContactById({ params: { id } })
        }),
        signal
      ),
    enabled,
    ...routeErrorWhenEmpty,
  })
}

/**
 * "Crea contatto" (`POST /task`). The caller reads the page again
 * (`refresh`), on success and on a rejection alike
 */
export const useCreateContact = () => {
  const run = useRun()
  return useMutation({
    mutationFn: (payload: { customerId: string; source: "list" | "detail" }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.createContact({ payload })
        })
      ),
  })
}
