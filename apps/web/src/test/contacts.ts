import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  AlertConfirmationRequired,
  type AlertNotFound,
  type ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  type DeadlineInPast,
  type OperatorNotFound,
} from "@mito/contract/errors"
import { type Customer } from "@mito/contract/customer"
import { type OperatorWithRole as OperatorWithRoleSchema } from "@mito/contract/me"
import {
  type ContactDetail,
  type ContactRow,
  type ContactsPage,
  type ContactsQuery,
  type PriorityBand,
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

/** An open alert, as the detail and a confirmation name it */
type OpenAlert = { id: number; deadline: Date; message: string | null }

/** How the backend answers a write of the detail: saved by default */
export type WriteAnswer<E> = { saved: true } | { rejected: E } | "down"

/** What the detail sent, as the backend received it */
export type PriorityChange = { taskId: number; priority: PriorityBand | "auto" }
export type Reassign = { taskId: number; operatorId: number }
export type CallbackSet = {
  taskId: number
  deadline: Date
  message?: string | null | undefined
  replacesAlertId: number | null
}
export type AlertResolve = { alertId: number; source: "list" | "detail" }

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
    callbacks: [] as CallbackSet[],
    /** `{ alert }`: another alert is open than the form said */
    callbackAnswer: (
      _change: CallbackSet
    ):
      | WriteAnswer<ContactForbidden | ContactSuperseded | DeadlineInPast>
      | { alert: OpenAlert } => ({ saved: true }),
    resolves: [] as AlertResolve[],
    resolveAnswer: (
      _change: AlertResolve
    ): WriteAnswer<ContactForbidden | ContactSuperseded | AlertNotFound> => ({
      saved: true,
    }),
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

  const handlers: FakeHandlers<
    GroupService<"task"> | GroupService<"operator"> | GroupService<"customer">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "operator", (handlers) =>
      handlers
        .handle("getAllUniqueOperators", () =>
          Effect.suspend(() =>
            state.failingOperators
              ? Effect.die("backend down")
              : Effect.succeed(state.operators)
          )
        )
        .handle("getOperatorById", unserved)
    ),
    // The customer of a detail, for its notes: a customer with no chat
    HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
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
          Effect.sync((): Customer | null => {
            const detail = Object.values(state.details).find(
              ({ customer }) => customer.id === params.id
            )
            return detail
              ? customerOf({
                  id: detail.customer.id,
                  name: detail.customer.name,
                  surname: detail.customer.surname,
                  operatorId: detail.customer.operatorId,
                  chatId: null,
                })
              : null
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
    ),
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
        .handle("getContactById", ({ params }) =>
          Effect.sync(() => state.detailReads.push(params.id)).pipe(
            Effect.andThen(
              Effect.promise(() => state.detailGate ?? Promise.resolve())
            ),
            Effect.andThen(
              Effect.suspend(() => {
                if (state.failingDetail) return Effect.die("backend down")
                const detail = state.details[Number(params.id)]
                return detail
                  ? Effect.succeed(detail)
                  : Effect.fail(new ContactNotFound())
              })
            )
          )
        )
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
        .handle("setCallback", ({ params, payload }) => {
          const change = { taskId: params.id, ...payload }
          let alert: OpenAlert | undefined
          return write(
            () => state.callbacks.push(change),
            () => {
              const answer = state.callbackAnswer(change)
              if (answer !== "down" && "alert" in answer) {
                alert = answer.alert
                return { saved: true }
              }
              return answer
            },
            () => {
              if (alert) return alert
              const id = 900 + state.callbacks.length
              updateDetail(params.id, (detail) => ({
                ...detail,
                contact: { ...detail.contact, state: "richiamare" },
                alert: {
                  id,
                  deadline: payload.deadline,
                  message: payload.message ?? null,
                },
              }))
              return id
            }
          ).pipe(
            Effect.flatMap((saved) =>
              typeof saved === "number"
                ? Effect.succeed({ alertId: saved })
                : Effect.fail(new AlertConfirmationRequired({ alert: saved }))
            )
          )
        })
        .handle("resolveAlert", ({ params, query }) => {
          const change = { alertId: params.id, source: query.source }
          return write(
            () => state.resolves.push(change),
            () => state.resolveAnswer(change),
            () => {
              const id = Object.values(state.details).find(
                (detail) => detail.alert?.id === params.id
              )?.contact.id
              if (id !== undefined) {
                updateDetail(id, (detail) => ({ ...detail, alert: null }))
              }
              return { resolved: id !== undefined }
            }
          )
        })
        .handle("bulkHandleTask", unserved)
    )
  )

  return { state, handlers }
}

/** The rejection of a contact superseded by `activeTaskId` */
export const superseded = (activeTaskId: number) =>
  new ContactSuperseded({ activeTaskId })
