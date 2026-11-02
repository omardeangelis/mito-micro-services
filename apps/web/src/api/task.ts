import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { Effect, Schema } from "effect"
import { type ApiError, isApiError } from "@mito/contract/errors"
import {
  type BulkHandleTask,
  ContactsQuery,
  type PriorityBand,
  type RegisterCall,
  type RegisteredCall,
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

/** The whole send of a «Registra chiamata», for the uncertain outcome (AC15, A3) */
export const REGISTER_CALL_TIMEOUT_MS = 15_000

/**
 * One press of an outcome: the input without `requestId`, which
 * `useRegisterCall` creates at each `mutate`
 */
export type RegisterCallInput = (RegisterCall extends infer T
  ? T extends unknown
    ? Omit<T, "requestId">
    : never
  : never) & { taskId: number }

/**
 * What `useRegisterCall` resolves with: the mutation never rejects, so
 * `isError` is never true and no toast shows. The caller reads `data.kind`:
 * - `registered`: saved, with what it leaves on the contact;
 * - `rejected`: the server refused and wrote nothing, `error` has the data
 *   of the text (`describeApiError`);
 * - `uncertain`: no answer we can trust (network, 5xx, body that doesn't
 *   read, 15 seconds): the call may or may not be saved (AC15)
 */
export type RegisterCallResult =
  | { kind: "registered"; registered: RegisteredCall }
  | { kind: "rejected"; error: ApiError }
  | { kind: "uncertain" }

/**
 * «Registra chiamata» (`POST /task/:id/call`). A new `requestId` at every
 * `mutate` (a new press is a new call, AC11), a single attempt (no retry:
 * only the server dedupes a repeat), and 15 seconds for the whole send (A3).
 * No toast, and it doesn't use `useContactMutationFeedback`: an uncertain
 * outcome has its own text (AC15). The state, the alert and the Storico of
 * the contact are read again as the call ends, whatever the outcome; the
 * pending state ends with the response, not with that read (AC33)
 */
export const useRegisterCall = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      ...press
    }: RegisterCallInput): Promise<RegisterCallResult> => {
      const payload = {
        ...press,
        requestId: crypto.randomUUID(),
      } as RegisterCall
      // `AbortSignal.timeout` isn't driven by fake timers, which the tests use
      const controller = new AbortController()
      const timer = setTimeout(
        () => controller.abort(),
        REGISTER_CALL_TIMEOUT_MS
      )
      try {
        const registered = await run(
          Effect.gen(function* () {
            const client = yield* ApiClient
            return yield* client.task.registerCall({
              params: { id: taskId },
              payload,
            })
          }),
          controller.signal
        )
        return { kind: "registered", registered }
      } catch (error) {
        // A declared error is an answer of the server; anything else is not
        if (isApiError(error)) return { kind: "rejected", error }
        return { kind: "uncertain" }
      } finally {
        clearTimeout(timer)
      }
    },
    retry: 0,
    // Offline it is sent all the same and fails at once as uncertain: the
    // default pauses it and sends it when the network is back, a resend the
    // user never pressed (AC15, D5)
    networkMode: "always",
    meta: { toastErrors: false },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all })
      void queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })
}

/**
 * «Togli il richiamo» (`POST /task/alerts/:id/remove`): closes the alert and
 * sets the state the user chose. The caller shows a rejection itself and
 * reads the page again
 */
export const useRemoveCallback = () => {
  const run = useRun()
  return useMutation({
    mutationFn: ({
      alertId,
      ...payload
    }: {
      alertId: number
      taskId: number
      state: TaskStatus
    }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.task.removeCallback({
            params: { id: alertId },
            payload,
          })
        })
      ),
    // Offline it fails at once instead of waiting paused for the network
    networkMode: "always",
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
