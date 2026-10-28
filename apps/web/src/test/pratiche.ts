import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type PracticeCustomer as PracticeCustomerSchema } from "@mito/contract/customer"
import { PracticeNotFound } from "@mito/contract/errors"
import {
  type CustomerPreview,
  type Practice,
  type PracticeListQuery,
  type PracticeListRow,
} from "@mito/contract/pratiche"
import { type PracticeState } from "@mito/contract/customer"
import { type FakeHandlers, type GroupService } from "./api"

type PracticeCustomer = typeof PracticeCustomerSchema.Type

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** A row of the practices list, with what the test changes */
export const practiceRow = (
  overrides: Partial<PracticeListRow> = {}
): PracticeListRow => ({
  id: 1001,
  praticaId: "PR-2026-1",
  productId: null,
  importoFinanziato: "12000.5",
  importoErogato: "12000",
  dataLiquidazione: new Date("2026-01-15T00:00:00Z"),
  stato: "Liquidata",
  importoRata: "200",
  rateTotali: 60,
  ratePagate: 3,
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  createdAt: new Date("2026-01-10T10:00:00Z"),
  operatore: "Ada",
  ...overrides,
})

/** A practice, as its detail reads it, with what the test changes */
export const practiceOf = (overrides: Partial<Practice> = {}): Practice => ({
  id: 1001,
  praticaId: "PR-2026-1",
  productId: null,
  state: "Liquidata",
  importoFinanziato: "12000.5",
  importoErogato: "12000",
  dataLiquidazione: new Date("2026-01-15T00:00:00Z"),
  importoRata: "200",
  rateTotali: 60,
  ratePagate: 3,
  chatId: null,
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  desPuntoVendita: null,
  operator: null,
  ...overrides,
})

/** A customer of a practice, with what the test changes */
export const practiceCustomer = (
  overrides: Partial<PracticeCustomer> = {}
): PracticeCustomer => ({
  id: "Xk3bT9qLm2",
  name: "Mario",
  surname: "Rossi",
  email: "mario.rossi@example.com",
  fiscalCode: "RSSMRA80A01H501U",
  vatCode: null,
  phoneNumber: "3331234567",
  blackListStatus: "whitelisted",
  operatorId: 7,
  operatorName: "Ada",
  operatorSurname: "Lovelace",
  customerRole: "Intestatario",
  ...overrides,
})

/**
 * A backend in memory for the pages Pratiche: the list (each query in
 * `searches`), the detail of each practice of `practices` with its customers,
 * the change of its state and of the contacts of a customer (in `stateWrites`
 * and `previewWrites`), and the files of the filter
 */
export function fakePratiche(
  initial: {
    rows?: PracticeListRow[]
    total?: number
    practices?: Practice[]
    customers?: Record<string, PracticeCustomer[]>
  } = {}
) {
  const state = {
    rows: initial.rows ?? [practiceRow()],
    total: initial.total ?? (initial.rows ?? [practiceRow()]).length,
    searches: [] as PracticeListQuery[],
    // The list doesn't answer: a 500
    failingList: false,
    practices: initial.practices ?? [practiceOf()],
    customers: initial.customers ?? { "PR-2026-1": [practiceCustomer()] },
    // The detail of a practice doesn't answer: a 500
    failingDetail: false,
    detailReads: [] as string[],
    stateWrites: [] as Array<{ id: number; state: PracticeState }>,
    // A write of the state doesn't answer: a 500
    failingState: false,
    previewWrites: [] as Array<{ id: string; values: CustomerPreview }>,
    // A write of the contacts doesn't answer: a 500
    failingPreview: false,
    files: [] as string[],
  }

  const handlers: FakeHandlers<
    GroupService<"pratiche"> | GroupService<"customer">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "pratiche", (handlers) =>
      handlers
        .handle("getAllPratiche", ({ payload }) =>
          Effect.suspend(() => {
            state.searches.push(payload)
            if (state.failingList) return Effect.die("backend down")
            return Effect.succeed({
              total: [{ total: state.total }],
              data: state.rows,
            })
          })
        )
        .handle("getPraticaById", ({ params }) =>
          Effect.suspend(() => {
            state.detailReads.push(params.id)
            if (state.failingDetail) return Effect.die("backend down")
            const practice = state.practices.find(
              ({ praticaId }) => praticaId === params.id
            )
            return practice
              ? Effect.succeed(practice)
              : Effect.fail(new PracticeNotFound())
          })
        )
        .handle("updatePraticaFromDashboard", ({ params, payload }) =>
          Effect.suspend(() => {
            if (state.failingState) return Effect.die("backend down")
            state.stateWrites.push({ id: params.id, state: payload.state })
            state.practices = state.practices.map((practice) =>
              practice.id === params.id
                ? { ...practice, state: payload.state }
                : practice
            )
            return Effect.succeed(
              state.practices.some(({ id }) => id === params.id)
                ? [{ id: params.id }]
                : []
            )
          })
        )
        .handle("updateCustomerPreview", ({ params, payload }) =>
          Effect.suspend(() => {
            if (state.failingPreview) return Effect.die("backend down")
            state.previewWrites.push({ id: params.id, values: payload })
            for (const [praticaId, customers] of Object.entries(
              state.customers
            ))
              state.customers[praticaId] = customers.map((customer) =>
                customer.id === params.id
                  ? { ...customer, ...payload }
                  : customer
              )
            return Effect.void
          })
        )
        .handle("getAllAvailableRegion", unserved)
        .handle("createPratica", unserved)
    ),
    HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
      handlers
        .handle("getAllCustomerForPratica", ({ params }) =>
          Effect.sync(() => state.customers[params.id] ?? [])
        )
        .handle("getAllFileName", () =>
          Effect.sync(() => state.files.map((fileName) => ({ fileName })))
        )
        .handle("getAllCustomers", unserved)
        .handle("getCustomersByFiscalCodeOrVatCode", unserved)
        .handle("getCustomerUnderReview", unserved)
        .handle("getAllAvailableComune", unserved)
        .handle("getAllAvaliableSede", unserved)
        .handle("getAllAvailableAmbito", unserved)
        .handle("getAllAvailableJobs", unserved)
        .handle("getCustomerById", unserved)
        .handle("getAllPraticaByCustomer", unserved)
        .handle("insertCustomer", unserved)
        .handle("updateCustomerFromDashboard", unserved)
        .handle("handleCustomerBlackList", unserved)
        .handle("handover", unserved)
        .handle("assignToYourself", unserved)
        .handle("updateLastEdit", unserved)
        .handle("bulkUpdateCustomers", unserved)
    )
  )
  return { state, handlers }
}
