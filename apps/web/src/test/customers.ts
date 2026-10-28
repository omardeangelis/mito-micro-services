import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  type BlackListStatus,
  type Customer,
  type CustomerListQuery,
  type CustomerListRow,
  type CustomerPractice as CustomerPracticeSchema,
  type CustomerProfile,
  type NewCustomer,
} from "@mito/contract/customer"
import {
  type ContactAlreadyActive,
  type ContactForbidden,
  ContactNotFound,
  type CustomerAssignmentForbidden,
  type CustomerNotFound,
  type CustomerUnassigned,
  type HandoverSameOperator,
  type OperatorNotFound,
} from "@mito/contract/errors"
import { type OperatorWithRole as OperatorWithRoleSchema } from "@mito/contract/me"
import {
  type ActiveAlert,
  type BulkHandleTask,
  type ContactDetail,
  type CustomerAlert,
  type Task,
} from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService } from "./api"

type OperatorWithRole = typeof OperatorWithRoleSchema.Type
type CustomerPractice = typeof CustomerPracticeSchema.Type

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** A row of the customers list, with what the test changes */
export const customerRow = (
  overrides: Partial<CustomerListRow> = {}
): CustomerListRow => ({
  id: "customer-1",
  name: "Mario",
  surname: "Rossi",
  fiscalCode: "RSSMRA80A01H501U",
  email: null,
  phoneNumber: null,
  comune: null,
  vatCode: null,
  birthdayDate: null,
  blackListStatus: "whitelisted",
  sede: null,
  ambitoLavorativo: null,
  occupazione: null,
  createdAt: new Date("2026-01-10T10:00:00Z"),
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
  signedPractices: 0,
  ...overrides,
})

/** A customer of the detail, with what the test changes */
export const customerOf = (overrides: Partial<Customer> = {}): Customer => ({
  id: "customer-1",
  fullName: "Mario Rossi",
  name: "Mario",
  sede: "Roma",
  surname: "Rossi",
  fiscalCode: "RSSMRA80A01H501U",
  vatCode: null,
  email: "mario@example.com",
  birthdayDate: null,
  age: null,
  phoneNumber: "3331234567",
  address: null,
  cap: null,
  blackListStatus: "whitelisted",
  comune: "Roma",
  provincia: null,
  tempID: "NDG-1",
  fileName: null,
  uniqueHash: "hash-1",
  reddito: null,
  occupazione: null,
  ambitoLavorativo: null,
  tipoContratto: null,
  createdAt: new Date("2026-01-10T10:00:00Z"),
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  lastImportUpdate: new Date("2026-01-10T10:00:00Z"),
  chatId: null,
  operatorId: 7,
  source: "inbound",
  ...overrides,
})

/** The active contact of a customer, with what the test changes */
export const taskOf = (overrides: Partial<Task> = {}): Task => ({
  id: 1000,
  createdAt: new Date("2026-10-01T09:00:00Z"),
  updatedAt: new Date("2026-10-01T09:00:00Z"),
  state: "chiamare",
  closedAt: null,
  customerId: "customer-1",
  operatorId: 7,
  alertId: null,
  priority: 0,
  customPriority: false,
  isActive: true,
  ...overrides,
})

/** The detail of `task`, on `customer`, as `getContactById` answers */
export const contactDetailOf = (
  task: Task,
  customer: Customer,
  operator: { id: number; name: string | null; surname: string | null } | null
): ContactDetail => ({
  contact: {
    id: task.id,
    state: task.state,
    priority: task.priority,
    customPriority: task.customPriority,
    isActive: task.isActive,
    closedAt: task.closedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    operator,
  },
  customer: {
    id: customer.id,
    name: customer.name,
    surname: customer.surname,
    phoneNumber: customer.phoneNumber,
    fiscalCode: customer.fiscalCode,
    vatCode: customer.vatCode,
    blackListStatus: customer.blackListStatus,
    operatorId: customer.operatorId,
  },
  alert: null,
  history: [],
  customerContacts: [],
  activeTaskId: null,
  editability: { kind: "editable" },
  canReassign: false,
})

/** An active operator, with a name and a surname */
export const operatorWithRole = (
  id: number,
  name: string | null,
  surname: string | null
): OperatorWithRole => ({
  ...ada,
  id,
  name,
  surname,
  userId: `user-${id}`,
  role: "OPERATORE",
})

/**
 * A backend in memory for the customers list: the groups `customer`,
 * `operator` and `task`, as far as the list calls them. `state` is what the
 * next calls answer, and what they received
 */
export function fakeCustomers(
  initial: Partial<{
    rows: CustomerListRow[]
    total: number
    operators: OperatorWithRole[]
    sedi: string[]
    files: string[]
    alerts: ActiveAlert[]
    customers: Customer[]
    practices: Record<string, CustomerPractice[]>
    tasks: Task[]
    customerAlerts: Record<string, CustomerAlert[]>
    contacts: Record<string, ContactDetail>
  }> = {}
) {
  const state = {
    rows: [customerRow()],
    total: undefined as number | undefined,
    operators: [
      operatorWithRole(1, "Anna", "Verdi"),
      operatorWithRole(2, "Mario", "Rossi"),
    ],
    sedi: ["Roma", "Milano"],
    files: ["clienti.xlsx"],
    alerts: [] as ActiveAlert[],
    /** The customers of the detail, and of the search by code */
    customers: [customerOf()],
    practices: {} as Record<string, CustomerPractice[]>,
    tasks: [] as Task[],
    customerAlerts: {} as Record<string, CustomerAlert[]>,
    /** The details of the contacts, by id */
    contacts: {} as Record<string, ContactDetail>,
    /** The new customers, the master data saved, in order */
    inserted: [] as NewCustomer[],
    updated: [] as { id: string; profile: CustomerProfile }[],
    handovers: [] as { id: string; toOperatorId: number }[],
    selfAssigned: [] as string[],
    createdContacts: [] as { customerId: string; source: string }[],
    /** What the next write answers instead of succeeding */
    insertFails: false,
    updateFails: false,
    handoverError: undefined as
      | CustomerNotFound
      | CustomerAssignmentForbidden
      | OperatorNotFound
      | HandoverSameOperator
      | undefined,
    assignError: undefined as
      | CustomerNotFound
      | CustomerAssignmentForbidden
      | OperatorNotFound
      | undefined,
    createContactError: undefined as
      | CustomerNotFound
      | CustomerUnassigned
      | ContactForbidden
      | ContactAlreadyActive
      | undefined,
    /** The queries of the list, in order */
    searches: [] as CustomerListQuery[],
    blackListed: [] as { id: string; blackListStatus: BlackListStatus }[],
    /** The calls of "Assegna Clienti" and of "Crea/assegna contatti" */
    assigned: [] as { operatorId: number; customerIds: readonly string[] }[],
    handled: [] as BulkHandleTask[],
    /** While set, the calls of the bulk assignment wait for it */
    gate: undefined as Promise<void> | undefined,
    /** The list dies, a 500 */
    failingList: false,
    /** The bulk assignments die, a 500 */
    failingBulk: false,
    /** The bulk assignments with one of these customers die at once */
    failingCustomerIds: [] as string[],
    ...initial,
  }
  /**
   * A bulk assignment of `customerIds`: it dies at once when one of them is
   * in `failingCustomerIds`, otherwise it waits for the gate
   */
  const waitGate = (customerIds: readonly string[]) =>
    Effect.suspend(() =>
      customerIds.some((id) => state.failingCustomerIds.includes(id))
        ? Effect.die("backend down")
        : Effect.promise(() => state.gate ?? Promise.resolve())
    ).pipe(
      Effect.andThen(
        Effect.suspend(() =>
          state.failingBulk ? Effect.die("backend down") : Effect.void
        )
      )
    )

  /** The customer, and its active contact, go to `operatorId` */
  const moveCustomer = (customerId: string, operatorId: number) => {
    state.customers = state.customers.map((customer) =>
      customer.id === customerId ? { ...customer, operatorId } : customer
    )
    state.tasks = state.tasks.map((task) =>
      task.customerId === customerId && task.isActive
        ? { ...task, operatorId }
        : task
    )
  }

  const handlers: FakeHandlers<
    GroupService<"customer"> | GroupService<"operator"> | GroupService<"task">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
      handlers
        .handle("getAllCustomers", ({ payload }) =>
          Effect.suspend(() => {
            state.searches.push(payload)
            if (state.failingList) return Effect.die("backend down")
            return Effect.succeed({
              allCustomers: state.rows,
              total: state.total ?? state.rows.length,
            })
          })
        )
        .handle("getCustomersByFiscalCodeOrVatCode", ({ query }) =>
          Effect.sync(() =>
            state.customers.filter(
              (customer) =>
                (query.fiscalCode !== undefined &&
                  customer.fiscalCode?.trim() === query.fiscalCode) ||
                (query.vatCode !== undefined &&
                  customer.vatCode?.trim() === query.vatCode) ||
                (query.tempID !== undefined && customer.tempID === query.tempID)
            )
          )
        )
        .handle("getAllCustomerForPratica", unserved)
        .handle("getCustomerUnderReview", unserved)
        .handle("getAllAvailableComune", unserved)
        .handle("getAllAvaliableSede", () =>
          Effect.sync(() => state.sedi.map((sede) => ({ sede })))
        )
        .handle("getAllAvailableAmbito", unserved)
        .handle("getAllAvailableJobs", unserved)
        .handle("getAllFileName", () =>
          Effect.sync(() => state.files.map((fileName) => ({ fileName })))
        )
        .handle("getCustomerById", ({ params }) =>
          Effect.sync(
            () => state.customers.find(({ id }) => id === params.id) ?? null
          )
        )
        .handle("getAllPraticaByCustomer", ({ params }) =>
          Effect.sync(() => state.practices[params.id] ?? [])
        )
        .handle("insertCustomer", ({ payload }) =>
          Effect.suspend(() => {
            if (state.insertFails) return Effect.die("backend down")
            state.inserted.push(payload)
            state.customers.push(customerOf({ ...payload, operatorId: ada.id }))
            return Effect.succeed([{ id: payload.id }])
          })
        )
        .handle("updateCustomerFromDashboard", ({ params, payload }) =>
          Effect.suspend(() => {
            if (state.updateFails) return Effect.die("backend down")
            state.updated.push({ id: params.id, profile: payload })
            state.customers = state.customers.map((customer) =>
              customer.id === params.id
                ? {
                    ...customer,
                    ...Object.fromEntries(
                      Object.entries(payload).filter(
                        ([, value]) => value !== undefined
                      )
                    ),
                  }
                : customer
            )
            return Effect.succeed([{ id: params.id }])
          })
        )
        .handle("handleCustomerBlackList", ({ params, payload }) =>
          Effect.sync(() => {
            state.blackListed.push({ id: params.id, ...payload })
          })
        )
        .handle("handover", ({ params, payload }) =>
          Effect.suspend(() => {
            if (state.handoverError) return Effect.fail(state.handoverError)
            state.handovers.push({ id: params.id, ...payload })
            moveCustomer(params.id, payload.toOperatorId)
            return Effect.succeed({
              contactMoved: state.tasks.some(
                (task) => task.customerId === params.id && task.isActive
              ),
            })
          })
        )
        .handle("assignToYourself", ({ params }) =>
          Effect.suspend(() => {
            if (state.assignError) return Effect.fail(state.assignError)
            state.selfAssigned.push(params.id)
            moveCustomer(params.id, ada.id)
            return Effect.void
          })
        )
        .handle("updateLastEdit", unserved)
        .handle("bulkUpdateCustomers", ({ payload }) =>
          waitGate(payload.customerIds).pipe(
            Effect.andThen(
              Effect.sync(() => {
                state.assigned.push(payload)
              })
            )
          )
        )
    ),
    HttpApiBuilder.group(MitoApi, "operator", (handlers) =>
      handlers.handle("getAllUniqueOperators", () =>
        Effect.sync(() => state.operators)
      )
    ),
    HttpApiBuilder.group(MitoApi, "task", (handlers) =>
      handlers
        .handle("getCustomersWithActiveAlerts", ({ payload }) =>
          Effect.sync(() =>
            state.alerts.filter(
              (alert) =>
                alert.customerId !== null &&
                payload.customerIds.includes(alert.customerId)
            )
          )
        )
        .handle("getActiveTask", ({ params }) =>
          Effect.sync(() =>
            state.tasks.filter(
              (task) => task.customerId === params.id && task.isActive
            )
          )
        )
        .handle("getCustomerAlerts", ({ params }) =>
          Effect.sync(() => state.customerAlerts[params.id] ?? [])
        )
        .handle("getContactById", ({ params }) =>
          Effect.suspend(() => {
            const contact = state.contacts[params.id]
            return contact
              ? Effect.succeed(contact)
              : Effect.fail(new ContactNotFound())
          })
        )
        .handle("createContact", ({ payload }) =>
          Effect.suspend(() => {
            if (state.createContactError)
              return Effect.fail(state.createContactError)
            state.createdContacts.push(payload)
            const customer = state.customers.find(
              ({ id }) => id === payload.customerId
            )!
            const task = taskOf({
              id: 2000 + state.createdContacts.length,
              customerId: customer.id,
              operatorId: customer.operatorId,
            })
            state.tasks.push(task)
            const operator =
              state.operators.find(({ id }) => id === customer.operatorId) ??
              null
            state.contacts[String(task.id)] = contactDetailOf(
              task,
              customer,
              operator
            )
            return Effect.succeed({ taskId: task.id })
          })
        )
        .handle("bulkHandleTask", ({ payload }) =>
          waitGate(payload.customerIds).pipe(
            Effect.andThen(
              Effect.sync(() => {
                state.handled.push(payload)
              })
            )
          )
        )
    )
  )
  return { state, handlers }
}
