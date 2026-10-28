import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { Effect, Schema } from "effect"
import {
  type BulkHandleTask,
  ContactsQuery,
  type PriorityBand,
  type TaskStatus,
} from "@mito/contract/task"
import { type GetContactsInput } from "@mito/domain/contact/listInput"
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
  contacts: (input: GetContactsInput) =>
    [...taskKeys.all, "getContacts", input] as const,
}

/**
 * One page of the contacts list (`POST /task/contacts`), for the input
 * `toContactsInput` gives: the payload is that input, which the contract
 * takes as it is for a state `parse` gave
 */
export const contactsOptions = (run: Run, input: GetContactsInput) =>
  queryOptions({
    queryKey: taskKeys.contacts(input),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const payload = yield* Schema.decodeUnknownEffect(ContactsQuery)(
            input
          ).pipe(Effect.orDie)
          const client = yield* ApiClient
          return yield* client.task.getContacts({ payload })
        }),
        signal
      ),
  })

/**
 * The page of `input`, and when it was read. While another page loads the
 * previous one stays, as the Next.js app keeps the page during a navigation
 * (`isPlaceholderData`). A page that fails goes to the error of the route,
 * as `contatti/error.tsx` of the Next.js app, with no toast: the filters and
 * the address of a list left on screen would speak of a page it doesn't show.
 * A page already on screen that fails to read again stays, with the toast
 */
export const useContacts = (input: GetContactsInput) =>
  useQuery({
    ...contactsOptions(useRun(), input),
    placeholderData: keepPreviousData,
    ...routeErrorWhenEmpty,
  })

/**
 * The state of a contact (`POST /task/:id/state`). The caller shows a
 * rejection itself (`useContactMutationFeedback`), no toast, and reads the
 * page again (`refresh`)
 */
export const useChangeState = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      taskId,
      ...payload
    }: {
      taskId: number
      toState: TaskStatus
      source: "list" | "detail"
      confirmedAlertId: number | null
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.changeState({
            params: { id: taskId },
            payload,
          })
        })
      ),
    meta: { toastErrors: false },
  })
}

/**
 * The priority of a contact (`POST /task/:id/priority`): a band set by hand,
 * or `auto`, which gives it back to the cron. The caller shows a rejection
 * itself, as for `useChangeState`
 */
export const useSetPriority = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      taskId,
      priority,
    }: {
      taskId: number
      priority: PriorityBand | "auto"
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.setPriority({
            params: { id: taskId },
            payload: { priority },
          })
        })
      ),
    meta: { toastErrors: false },
  })
}

/**
 * The operator of a contact (`POST /task/:id/reassign`, admin). The caller
 * shows a rejection itself
 */
export const useReassign = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      taskId,
      operatorId,
    }: {
      taskId: number
      operatorId: number
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.reassign({
            params: { id: taskId },
            payload: { operatorId },
          })
        })
      ),
    meta: { toastErrors: false },
  })
}

/**
 * A callback on a contact (`POST /task/:id/callback`), which replaces the
 * open alert the form showed. The caller shows a rejection itself
 */
export const useSetCallback = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      taskId,
      ...payload
    }: {
      taskId: number
      deadline: Date
      message: string | null
      replacesAlertId: number | null
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.setCallback({
            params: { id: taskId },
            payload,
          })
        })
      ),
    meta: { toastErrors: false },
  })
}

/**
 * Closes an open alert (`DELETE /task/alerts/:id`). The caller shows a
 * rejection itself
 */
export const useResolveAlert = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      alertId,
      source,
    }: {
      alertId: number
      source: "list" | "detail"
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.resolveAlert({
            params: { id: alertId },
            query: { source },
          })
        })
      ),
    meta: { toastErrors: false },
  })
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
const activeTaskOptions = (run: Run, customerId: string) =>
  queryOptions({
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
  })

export const useActiveTask = (customerId: string) =>
  useQuery({
    ...activeTaskOptions(useRun(), customerId),
    ...routeErrorWhenEmpty,
  })

/**
 * The alerts of a customer, open and closed
 * (`GET /task/by-customer/:id/alerts`)
 */
const customerAlertsOptions = (run: Run, customerId: string) =>
  queryOptions({
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
  })

export const useCustomerAlerts = (
  customerId: string,
  { enabled }: { enabled: boolean }
) =>
  useQuery({
    ...customerAlertsOptions(useRun(), customerId),
    enabled,
    ...routeErrorWhenEmpty,
  })

/** The detail of a contact (`GET /task/:id`) */
const contactOptions = (run: Run, id: string) =>
  queryOptions({
    queryKey: taskKeys.contact(id),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.getContactById({ params: { id } })
        }),
        signal
      ),
  })

export const useContactDetail = (
  id: string,
  { enabled }: { enabled: boolean }
) =>
  useQuery({
    ...contactOptions(useRun(), id),
    enabled,
    ...routeErrorWhenEmpty,
  })

/**
 * The contact of the detail page. While another contact loads (a reopening,
 * "Vai al contatto attivo") the one on screen stays, as the Next.js app keeps
 * the page until the new one is ready. `ContactNotFound` stays on the page,
 * which says so inside the sheet (AC26); any other failure with nothing on
 * screen goes to the error of the route, as `contatti/error.tsx`
 */
export const useContactPage = (id: string) =>
  useQuery({
    ...contactOptions(useRun(), id),
    placeholderData: keepPreviousData,
    meta: { toastErrors: "withData" },
    throwOnError: (error, query) =>
      query.state.data === undefined && error._tag !== "ContactNotFound",
  })

/**
 * Reads what the summary of the active contact of a customer shows: the
 * contact, its detail and the alerts when it has one. The customer sheet
 * reads them one after the other; after a refresh this reads them before
 * its end, so the end of the wait finds them on screen
 */
export const useLoadActiveContact = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useCallback(
    async (customerId: string) => {
      // The sheet reads it, so the refresh has read it again already
      const [task] = await queryClient.ensureQueryData(
        activeTaskOptions(run, customerId)
      )
      if (!task) return
      await Promise.all([
        queryClient.ensureQueryData(contactOptions(run, String(task.id))),
        // From the backend: without a contact with an alert the sheet
        // didn't read them, and what the cache holds may be old
        task.alertId === null
          ? undefined
          : queryClient.fetchQuery(customerAlertsOptions(run, customerId)),
      ])
    },
    [run, queryClient]
  )
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
