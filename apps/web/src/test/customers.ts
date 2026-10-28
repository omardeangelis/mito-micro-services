import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  type BlackListStatus,
  type CustomerListQuery,
  type CustomerListRow,
} from "@mito/contract/customer"
import { type OperatorWithRole as OperatorWithRoleSchema } from "@mito/contract/me"
import { type ActiveAlert, type BulkHandleTask } from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService } from "./api"

type OperatorWithRole = typeof OperatorWithRoleSchema.Type

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
    ...initial,
  }
  const waitGate = Effect.promise(() => state.gate ?? Promise.resolve()).pipe(
    Effect.andThen(
      Effect.suspend(() =>
        state.failingBulk ? Effect.die("backend down") : Effect.void
      )
    )
  )

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
        .handle("getCustomersByFiscalCodeOrVatCode", unserved)
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
        .handle("getCustomerById", unserved)
        .handle("getAllPraticaByCustomer", unserved)
        .handle("insertCustomer", unserved)
        .handle("updateCustomerFromDashboard", unserved)
        .handle("handleCustomerBlackList", ({ params, payload }) =>
          Effect.sync(() => {
            state.blackListed.push({ id: params.id, ...payload })
          })
        )
        .handle("handover", unserved)
        .handle("assignToYourself", unserved)
        .handle("updateLastEdit", unserved)
        .handle("bulkUpdateCustomers", ({ payload }) =>
          waitGate.pipe(
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
        .handle("bulkHandleTask", ({ payload }) =>
          waitGate.pipe(
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
