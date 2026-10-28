import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  AlertConfirmationRequired,
  type ContactForbidden,
  ContactSuperseded,
} from "@mito/contract/errors"
import { type OperatorWithRole as OperatorWithRoleSchema } from "@mito/contract/me"
import {
  type ContactRow,
  type ContactsPage,
  type ContactsQuery,
  type TaskStatus,
} from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService } from "./api"

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
 * A backend in memory for the contacts list: `GET /operator`, and of the
 * group `task` the page of the list and the change of state. `state.rows`
 * are the contacts, all on one page unless `state.page` says otherwise;
 * `queries` are the pages asked for, in order. A held page (`listGate`)
 * answers when the test opens it; a state change goes through `changeAnswer`
 * (saved by default: the row takes the new state)
 */
export function fakeContacts(
  initial: {
    rows?: ContactRow[]
    previous?: ContactRow[]
    operators?: OperatorWithRole[]
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
  }

  const pageOf = (query: ContactsQuery): ContactsPage =>
    state.page?.(query) ?? {
      contacts: state.rows,
      total: state.rows.filter(({ isActive }) => isActive).length,
      previous: state.previous,
      customerFilter: null,
    }

  const handlers: FakeHandlers<
    GroupService<"task"> | GroupService<"operator">
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
        .handle("getContactById", unserved)
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
                    const row = state.rows.find(({ id }) => id === params.id)
                    return Effect.fail(
                      new AlertConfirmationRequired({
                        alert: {
                          id: row?.alert?.id ?? 1,
                          deadline:
                            row?.alert?.deadline ??
                            new Date("2026-10-20T08:00:00Z"),
                          message: row?.alert?.message ?? null,
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
                  return Effect.succeed({
                    taskId: answer.reopenedAs ?? params.id,
                    reopened: answer.reopenedAs !== undefined,
                  })
                }
              )
            )
          )
        )
        .handle("setPriority", unserved)
        .handle("reassign", unserved)
        .handle("setCallback", unserved)
        .handle("resolveAlert", unserved)
        .handle("bulkHandleTask", unserved)
    )
  )

  return { state, handlers }
}

/** The rejection of a contact superseded by `activeTaskId` */
export const superseded = (activeTaskId: number) =>
  new ContactSuperseded({ activeTaskId })
