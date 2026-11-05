import { Effect, Layer } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  AlertConfirmationRequired,
  type CallAlreadyWorked,
  type CallbackChanged,
  type CallNotAllowed,
  type ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  type DeadlineInPast,
  type MessageTooLong,
  type OperatorNotFound,
  type RequestIdConflict,
  type TransitionRejected,
  Unauthorized,
} from "@mito/contract/errors"
import { type Customer } from "@mito/contract/customer"
import { type OperatorWithRole as OperatorWithRoleSchema } from "@mito/contract/me"
import {
  type ContactDetail,
  type ContactRow,
  type ContactsPage,
  type ContactsQuery,
  type PriorityBand,
  type RegisterCall,
  type RegisteredCall,
  type TaskStatus,
} from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService } from "./api"
import { customerOf } from "./customers"

type OperatorWithRole = typeof OperatorWithRoleSchema.Type

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** A customer of a row: Mario Rossi, of Ada */
export const contactCustomer = (
  overrides: Partial<ContactRow["customer"]> = {}
): ContactRow["customer"] => ({
  id: "c1",
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "333 1234567",
  fiscalCode: "RSSMRA80A01H501U",
  vatCode: null,
  blackListStatus: "whitelisted",
  operatorId: ada.id,
  ...overrides,
})

/** A row of the list: the active contact of Mario Rossi, of Ada, to call */
export const contactRow = (
  overrides: Partial<ContactRow> = {}
): ContactRow => ({
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: new Date("2026-10-03T08:00:00Z"),
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: ada.id, name: ada.name, surname: ada.surname },
  customer: contactCustomer(),
  alert: null,
  ...overrides,
})

/**
 * The detail of a contact, as `GET /task/:id` answers: by default the one of
 * `contactRow`, editable, with no alert and no other contacts
 */
export const contactDetail = (
  overrides: Partial<Omit<ContactDetail, "contact">> & {
    contact?: Partial<ContactDetail["contact"]>
  } = {}
): ContactDetail => {
  const row = contactRow()
  const { contact, ...rest } = overrides
  return {
    contact: {
      id: row.id,
      state: row.state,
      priority: row.priority,
      customPriority: false,
      isActive: true,
      closedAt: row.closedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      operator: row.operator,
      ...contact,
    },
    customer: row.customer,
    alert: null,
    history: [],
    closures: [],
    calls: [],
    customerContacts: [],
    activeTaskId: null,
    editability: { kind: "editable" },
    canReassign: false,
    ...rest,
  }
}

/** An active operator of `GET /operator` */
export const activeOperator = (
  overrides: Partial<OperatorWithRole> = {}
): OperatorWithRole => ({ ...ada, role: "OPERATORE", ...overrides })

/** A state change the page sent, as the backend received it */
export type StateChange = {
  taskId: number
  toState: TaskStatus
  source: "list" | "detail"
  confirmedAlertId: number | null
}

/** How the backend answers a state change */
export type ChangeAnswer =
  | { saved: true; reopenedAs?: number }
  | { rejected: ContactForbidden | ContactSuperseded }
  | "alert"
  | "down"

/**
 * How the backend answers a write of the detail: saved by default. "down" is
 * a 500; "badRequest" a 400 the endpoint doesn't declare (an older server)
 */
export type WriteAnswer<E> =
  { saved: true } | { rejected: E } | "down" | "badRequest"

/** What the detail sent, as the backend received it */
export type PriorityChange = { taskId: number; priority: PriorityBand | "auto" }
export type Reassign = { taskId: number; operatorId: number }
export type CallRegistered = RegisterCall & { taskId: number }

/** «Togli il richiamo» as the page sent it, as the backend received it */
export type CallbackRemoved = {
  alertId: number
  taskId: number
  state: TaskStatus
}

/** The rejections of «Registra chiamata» a test can give */
export type CallRejection =
  | ContactForbidden
  | ContactSuperseded
  | CallAlreadyWorked
  | CallNotAllowed
  | AlertConfirmationRequired
  | DeadlineInPast
  | MessageTooLong
  | RequestIdConflict
  | ContactNotFound

const bandValues = { low: 20, medium: 60, high: 100, urgent: 120 } as const

/**
 * A backend in memory for the contacts: `GET /operator`, the customer of a
 * detail with no chat, and of the group `task` the page of the list, the
 * detail of a contact and its writes. `state.rows` are the contacts of the
 * list, all on one page unless `state.page` says otherwise; `queries` are
 * the pages asked for, in order. `state.details` are the contacts a detail
 * reads (`detailReads`), by id; any other is `ContactNotFound`. A held page
 * (`listGate`), detail (`detailGate`), state change (`changeGate`) or other
 * write (`writeGate`) answers when the test opens it. A write goes through
 * its answer, saved by default: the row and the detail take it
 */
export function fakeContacts(
  initial: {
    rows?: ContactRow[]
    previous?: ContactRow[]
    operators?: OperatorWithRole[]
    details?: Record<number, ContactDetail>
  } = {}
) {
  const state = {
    rows: initial.rows ?? [contactRow()],
    previous: initial.previous ?? [],
    operators: initial.operators ?? [activeOperator()],
    /** The page for a query, in place of all the rows */
    page: undefined as ((query: ContactsQuery) => ContactsPage) | undefined,
    queries: [] as ContactsQuery[],
    /** Until it resolves, the pages wait */
    listGate: undefined as Promise<void> | undefined,
    /** The list doesn't answer: a 500 */
    failingList: false,
    /** The operators don't answer: a 500 */
    failingOperators: false,
    changes: [] as StateChange[],
    changeAnswer: (_change: StateChange): ChangeAnswer => ({ saved: true }),
    /** Until it resolves, the state changes wait */
    changeGate: undefined as Promise<void> | undefined,
    details: initial.details ?? {},
    detailReads: [] as string[],
    /** Until it resolves, the details wait */
    detailGate: undefined as Promise<void> | undefined,
    /** The details don't answer: a 500 */
    failingDetail: false,
    /** The customers don't answer: a 500 */
    failingCustomer: false,
    /** The details and the customers answer that the session expired */
    sessionExpired: false,
    /** Until it resolves, the writes of the detail other than the state wait */
    writeGate: undefined as Promise<void> | undefined,
    priorities: [] as PriorityChange[],
    priorityAnswer: (
      _change: PriorityChange
    ): WriteAnswer<ContactForbidden | ContactSuperseded> => ({ saved: true }),
    reassigns: [] as Reassign[],
    reassignAnswer: (
      _change: Reassign
    ): WriteAnswer<
      ContactForbidden | ContactSuperseded | OperatorNotFound
    > => ({
      saved: true,
    }),
    calls: [] as CallRegistered[],
    callAnswer: (_call: CallRegistered): WriteAnswer<CallRejection> => ({
      saved: true,
    }),
    /** The response of each request id, so a repeat gets the same one */
    registered: new Map<string, RegisteredCall>(),
    removals: [] as CallbackRemoved[],
    removeAnswer: (
      _removal: CallbackRemoved
    ): WriteAnswer<
      | ContactForbidden
      | ContactSuperseded
      | CallbackChanged
      | TransitionRejected
    > => ({ saved: true }),
  }

  /** The detail of `id` changed by `change`, when the backend has it */
  const updateDetail = (
    id: number,
    change: (detail: ContactDetail) => ContactDetail
  ) => {
    const detail = state.details[id]
    if (detail) state.details = { ...state.details, [id]: change(detail) }
  }

  /** The writes of the detail other than the state: held, then answered */
  const write = <A, E>(
    record: () => void,
    answer: () => WriteAnswer<E>,
    save: () => A
  ): Effect.Effect<A, E> =>
    Effect.promise(() => state.writeGate ?? Promise.resolve()).pipe(
      Effect.andThen(
        Effect.suspend((): Effect.Effect<A, E> => {
          record()
          const result = answer()
          if (result === "down") return Effect.die("backend down")
          if (result === "badRequest") {
            return Effect.die(HttpApiError.BadRequest.singleton)
          }
          if ("rejected" in result) return Effect.fail(result.rejected)
          return Effect.sync(save)
        })
      )
    )

  const pageOf = (query: ContactsQuery): ContactsPage =>
    state.page?.(query) ?? {
      contacts: state.rows,
      total: state.rows.filter(({ isActive }) => isActive).length,
      previous: state.previous,
      customerFilter: null,
    }

  const operatorGroup = HttpApiBuilder.group(MitoApi, "operator", (handlers) =>
    handlers
      .handle("getAllUniqueOperators", () =>
        Effect.suspend(() =>
          state.failingOperators
            ? Effect.die("backend down")
            : Effect.succeed(state.operators)
        )
      )
      .handle("getOperatorById", unserved)
      .handle("updateOperatorsRole", unserved)
      .handle("getDeactivationImpact", unserved)
      .handle("getOperatorsForDeactivation", unserved)
      .handle("getTeam", unserved)
      .handle("deactivate", unserved)
  )

  // The customer of a detail, for its notes: a customer with no chat
  const customerGroup = HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
    handlers
      .handle("getAllCustomers", unserved)
      .handle("getCustomersByFiscalCodeOrVatCode", unserved)
      .handle("getAllCustomerForPratica", unserved)
      .handle("getCustomerUnderReview", unserved)
      .handle("getAllAvailableComune", unserved)
      .handle("getAllAvaliableSede", unserved)
      .handle("getAllAvailableAmbito", unserved)
      .handle("getAllAvailableJobs", unserved)
      .handle("getAllFileName", unserved)
      .handle("getCustomerById", ({ params }) =>
        Effect.suspend(() => {
          if (state.sessionExpired) return Effect.fail(new Unauthorized())
          if (state.failingCustomer) return Effect.die("backend down")
          const detail = Object.values(state.details).find(
            ({ customer }) => customer.id === params.id
          )
          const customer: Customer | null = detail
            ? customerOf({
                id: detail.customer.id,
                name: detail.customer.name,
                surname: detail.customer.surname,
                operatorId: detail.customer.operatorId,
                chatId: null,
              })
            : null
          return Effect.succeed(customer)
        })
      )
      .handle("getAllPraticaByCustomer", unserved)
      .handle("insertCustomer", unserved)
      .handle("updateCustomerFromDashboard", unserved)
      .handle("handleCustomerBlackList", unserved)
      .handle("handover", unserved)
      .handle("assignToYourself", unserved)
      .handle("updateLastEdit", unserved)
      .handle("bulkUpdateCustomers", unserved)
  )

  const getContactById = ({
    params,
  }: {
    readonly params: { readonly id: string }
  }) =>
    Effect.sync(() => state.detailReads.push(params.id)).pipe(
      Effect.andThen(
        Effect.promise(() => state.detailGate ?? Promise.resolve())
      ),
      Effect.andThen(
        Effect.suspend(
          (): Effect.Effect<ContactDetail, ContactNotFound | Unauthorized> => {
            if (state.sessionExpired) return Effect.fail(new Unauthorized())
            if (state.failingDetail) return Effect.die("backend down")
            const detail = state.details[Number(params.id)]
            return detail
              ? Effect.succeed(detail)
              : Effect.fail(new ContactNotFound())
          }
        )
      )
    )

  const registerCall = ({
    params,
    payload,
  }: {
    readonly params: { readonly id: number }
    readonly payload: RegisterCall
  }) => {
    const call = { taskId: params.id, ...payload }
    const repeated = state.registered.get(payload.requestId)
    if (repeated) return Effect.succeed(repeated)
    return write(
      () => state.calls.push(call),
      () => state.callAnswer(call),
      (): RegisteredCall => {
        const current =
          state.details[params.id]?.alert ??
          state.rows.find(({ id }) => id === params.id)?.alert ??
          null
        const alert =
          payload.outcome === "richiamare"
            ? {
                id: 900 + state.calls.length,
                deadline: new Date(`${payload.callback.day}T00:00:00`),
                day: payload.callback.day,
                // Empty or blank is no message, as on the server
                message: payload.callback.message?.trim()
                  ? payload.callback.message.trim()
                  : null,
              }
            : payload.outcome === "non risponde" && current
              ? {
                  ...current,
                  day: current.deadline.toISOString().slice(0, 10),
                }
              : null
        const futureAlert =
          alert !== null && alert.day > new Date().toISOString().slice(0, 10)
        const toState: TaskStatus =
          payload.outcome === "non risponde" && futureAlert
            ? "richiamare"
            : payload.outcome
        const at = new Date()
        const openAlert = alert && {
          id: alert.id,
          deadline: alert.deadline,
          message: alert.message,
        }
        state.rows = state.rows.map((row) =>
          row.id === params.id
            ? { ...row, state: toState, closedAt: at, alert: openAlert }
            : row
        )
        // The call on top of the Storico, and the alert it closed or
        // replaced in it, closed by Ada with the call (AC16, AC23)
        const closed = payload.outcome === "non risponde" ? null : current
        updateDetail(params.id, (detail) => ({
          ...detail,
          contact: { ...detail.contact, state: toState, closedAt: at },
          alert: openAlert,
          calls: [
            {
              id: 700 + state.calls.length,
              outcome: payload.outcome,
              at,
              operatorName: ada.name,
              operatorSurname: ada.surname,
              callbackDeadline:
                payload.outcome === "richiamare"
                  ? (alert?.deadline ?? null)
                  : null,
            },
            ...detail.calls,
          ],
          ...(closed
            ? {
                history: [
                  {
                    id: closed.id,
                    deadline: closed.deadline,
                    message: closed.message,
                    updatedAt: at,
                    resolvedByName: ada.name,
                    resolvedBySurname: ada.surname,
                  },
                  ...detail.history,
                ],
                closures: [
                  {
                    alertId: closed.id,
                    closedAt: at,
                    resolution: "call" as const,
                  },
                  ...detail.closures,
                ],
              }
            : {}),
        }))
        const registered: RegisteredCall = {
          taskId: params.id,
          state: toState,
          alert,
          call: {
            id: 700 + state.calls.length,
            outcome: payload.outcome,
            origin: "list",
            at,
            by: `${ada.name} ${ada.surname}`,
          },
        }
        state.registered.set(payload.requestId, registered)
        return registered
      }
    )
  }

  const removeCallback = ({
    params,
    payload,
  }: {
    readonly params: { readonly id: number }
    readonly payload: Omit<CallbackRemoved, "alertId">
  }) => {
    const removal = { alertId: params.id, ...payload }
    return write(
      () => state.removals.push(removal),
      () => state.removeAnswer(removal),
      () => {
        state.rows = state.rows.map((row) =>
          row.id === payload.taskId
            ? { ...row, state: payload.state, alert: null }
            : row
        )
        updateDetail(payload.taskId, (detail) => ({
          ...detail,
          contact: { ...detail.contact, state: payload.state },
          alert: null,
        }))
        return { taskId: payload.taskId, state: payload.state }
      }
    )
  }

  const handlers: FakeHandlers<
    GroupService<"task"> | GroupService<"operator"> | GroupService<"customer">
  > = Layer.mergeAll(
    operatorGroup,
    customerGroup,
    HttpApiBuilder.group(MitoApi, "task", (handlers) =>
      handlers
        .handle("getCustomersWithActiveAlerts", unserved)
        .handle("getActiveTask", unserved)
        .handle("getCustomerAlerts", unserved)
        .handle("getContacts", ({ payload }) =>
          Effect.sync(() => state.queries.push(payload)).pipe(
            Effect.andThen(
              Effect.promise(() => state.listGate ?? Promise.resolve())
            ),
            Effect.andThen(
              Effect.suspend(() =>
                state.failingList
                  ? Effect.die("backend down")
                  : Effect.succeed(pageOf(payload))
              )
            )
          )
        )
        .handle("getContactById", getContactById)
        .handle("createContact", unserved)
        .handle("changeState", ({ params, payload }) =>
          Effect.promise(() => state.changeGate ?? Promise.resolve()).pipe(
            Effect.andThen(
              Effect.suspend(
                (): Effect.Effect<
                  { taskId: number; reopened: boolean },
                  | AlertConfirmationRequired
                  | ContactForbidden
                  | ContactSuperseded
                > => {
                  const change = { taskId: params.id, ...payload }
                  state.changes.push(change)
                  const answer = state.changeAnswer(change)
                  if (answer === "down") return Effect.die("backend down")
                  if (answer === "alert") {
                    const alert =
                      state.details[params.id]?.alert ??
                      state.rows.find(({ id }) => id === params.id)?.alert
                    return Effect.fail(
                      new AlertConfirmationRequired({
                        alert: {
                          id: alert?.id ?? 1,
                          deadline:
                            alert?.deadline ?? new Date("2026-10-20T08:00:00Z"),
                          message: alert?.message ?? null,
                        },
                      })
                    )
                  }
                  if ("rejected" in answer) return Effect.fail(answer.rejected)
                  state.rows = state.rows.map((row) =>
                    row.id === params.id
                      ? {
                          ...row,
                          state: payload.toState,
                          alert:
                            payload.confirmedAlertId === null
                              ? row.alert
                              : null,
                        }
                      : row
                  )
                  if (answer.reopenedAs === undefined) {
                    updateDetail(params.id, (detail) => ({
                      ...detail,
                      contact: { ...detail.contact, state: payload.toState },
                      alert:
                        payload.confirmedAlertId === null ? detail.alert : null,
                    }))
                  }
                  return Effect.succeed({
                    taskId: answer.reopenedAs ?? params.id,
                    reopened: answer.reopenedAs !== undefined,
                  })
                }
              )
            )
          )
        )
        .handle("setPriority", ({ params, payload }) => {
          const change = { taskId: params.id, ...payload }
          return write(
            () => state.priorities.push(change),
            () => state.priorityAnswer(change),
            () =>
              updateDetail(params.id, (detail) => ({
                ...detail,
                contact: {
                  ...detail.contact,
                  customPriority: payload.priority !== "auto",
                  priority:
                    payload.priority === "auto"
                      ? detail.contact.priority
                      : bandValues[payload.priority],
                },
              }))
          )
        })
        .handle("reassign", ({ params, payload }) => {
          const change = { taskId: params.id, ...payload }
          return write(
            () => state.reassigns.push(change),
            () => state.reassignAnswer(change),
            () => {
              const operator = state.operators.find(
                ({ id }) => id === payload.operatorId
              )
              updateDetail(params.id, (detail) => ({
                ...detail,
                contact: {
                  ...detail.contact,
                  operator: operator
                    ? {
                        id: operator.id,
                        name: operator.name,
                        surname: operator.surname,
                      }
                    : null,
                },
              }))
              return { contactChanged: true, customerChanged: false }
            }
          )
        })
        .handle("registerCall", registerCall)
        .handle("removeCallback", removeCallback)
        .handle("bulkHandleTask", unserved)
    )
  )

  return {
    state,
    handlers,
    /** The pieces another fake composes, when it holds the group `task` too */
    groups: { operator: operatorGroup, customer: customerGroup },
    endpoints: { getContactById, registerCall, removeCallback },
  }
}

/** The rejection of a contact superseded by `activeTaskId` */
export const superseded = (activeTaskId: number) =>
  new ContactSuperseded({ activeTaskId })
