import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  CustomerAssignmentForbidden,
  CustomerNotFound,
  HandoverSameOperator,
  OperatorNotFound,
} from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import {
  assignCustomers,
  assignToYourself,
  handover,
} from "../services/customer/assignment"
import {
  listAmbiti,
  listComuni,
  listFileNames,
  listJobs,
  listSedi,
} from "../services/customer/filterOptions"
import { listCustomers } from "../services/customer/list"
import {
  createCustomer,
  markCustomerUpdated,
  setBlackListStatus,
  updateCustomerProfile,
} from "../services/customer/profile"
import {
  findCustomersByCode,
  getCustomerById,
  listCustomersOfPractice,
  listCustomersUnderReview,
  listPracticesOfCustomer,
} from "../services/customer/queries"
import { unexpectedAs500 } from "./unexpected"

/** The errors of the assignment services, in the classes of the contract */
const assignmentErrors = {
  CustomerNotFound: () => Effect.fail(new CustomerNotFound()),
  CustomerAssignmentForbidden: () =>
    Effect.fail(new CustomerAssignmentForbidden()),
  OperatorNotFound: () => Effect.fail(new OperatorNotFound()),
} as const

/**
 * The group `customer`: adapters of the services the procedures of the tRPC
 * router `customer` call, with no logic of their own (H16)
 */
export const CustomerLive = HttpApiBuilder.group(
  MitoApi,
  "customer",
  (handlers) =>
    Effect.gen(function* () {
      // The database and the reporter of the layer, so the handlers need
      // nothing per request but `CurrentUser`
      const services = yield* Effect.context<Db | ErrorReporter>()
      return handlers
        .handle("getAllCustomers", ({ payload }) =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            return yield* listCustomers(
              { ...payload, searchBy: payload.searchBy ?? "fiscalCode" },
              operator.id
            ).pipe(unexpectedAs500("getAllCustomers"))
          }).pipe(Effect.provide(services))
        )
        .handle("getCustomersByFiscalCodeOrVatCode", ({ query }) =>
          findCustomersByCode(query).pipe(
            unexpectedAs500("getCustomersByFiscalCodeOrVatCode"),
            Effect.provide(services)
          )
        )
        .handle("getAllCustomerForPratica", ({ params }) =>
          listCustomersOfPractice(params.id).pipe(
            unexpectedAs500("getAllCustomerForPratica"),
            Effect.provide(services)
          )
        )
        .handle("getCustomerUnderReview", () =>
          listCustomersUnderReview().pipe(
            unexpectedAs500("getCustomerUnderReview"),
            Effect.provide(services)
          )
        )
        .handle("getAllAvailableComune", () =>
          listComuni().pipe(
            unexpectedAs500("getAllAvailableComune"),
            Effect.provide(services)
          )
        )
        .handle("getAllAvaliableSede", () =>
          listSedi().pipe(
            unexpectedAs500("getAllAvaliableSede"),
            Effect.provide(services)
          )
        )
        .handle("getAllAvailableAmbito", () =>
          listAmbiti().pipe(
            unexpectedAs500("getAllAvailableAmbito"),
            Effect.provide(services)
          )
        )
        .handle("getAllAvailableJobs", () =>
          listJobs().pipe(
            unexpectedAs500("getAllAvailableJobs"),
            Effect.provide(services)
          )
        )
        .handle("getAllFileName", ({ query }) =>
          listFileNames(query.table).pipe(
            unexpectedAs500("getAllFileName"),
            Effect.provide(services)
          )
        )
        .handle("getCustomerById", ({ params }) =>
          getCustomerById(params.id).pipe(
            Effect.map((customer) => customer ?? null),
            unexpectedAs500("getCustomerById"),
            Effect.provide(services)
          )
        )
        .handle("getAllPraticaByCustomer", ({ params }) =>
          listPracticesOfCustomer(params.id).pipe(
            unexpectedAs500("getAllPraticaByCustomer"),
            Effect.provide(services)
          )
        )
        .handle("insertCustomer", ({ payload }) =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            return yield* createCustomer({
              ...payload,
              operatorId: operator.id,
            }).pipe(unexpectedAs500("insertCustomer"))
          }).pipe(Effect.provide(services))
        )
        .handle("updateCustomerFromDashboard", ({ params, payload }) =>
          updateCustomerProfile(params.id, payload).pipe(
            unexpectedAs500("updateCustomerFromDashboard"),
            Effect.provide(services)
          )
        )
        .handle("handleCustomerBlackList", ({ params, payload }) =>
          setBlackListStatus(params.id, payload.blackListStatus).pipe(
            unexpectedAs500("handleCustomerBlackList"),
            Effect.provide(services)
          )
        )
        .handle("handover", ({ params, payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* handover({
              customerId: params.id,
              toOperatorId: payload.toOperatorId,
              actor,
            }).pipe(
              Effect.catchTags({
                ...assignmentErrors,
                HandoverSameOperator: () =>
                  Effect.fail(new HandoverSameOperator()),
              }),
              unexpectedAs500("handover")
            )
          }).pipe(Effect.provide(services))
        )
        .handle("assignToYourself", ({ params }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            yield* assignToYourself({ customerId: params.id, actor }).pipe(
              Effect.catchTags(assignmentErrors),
              unexpectedAs500("assignToYourself")
            )
          }).pipe(Effect.provide(services))
        )
        .handle("updateLastEdit", ({ params }) =>
          markCustomerUpdated(params.id).pipe(
            unexpectedAs500("updateLastEdit"),
            Effect.provide(services)
          )
        )
        .handle("bulkUpdateCustomers", ({ payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            yield* assignCustomers({
              customerIds: payload.customerIds,
              toOperatorId: payload.operatorId,
              actor,
            }).pipe(
              Effect.catchTags(assignmentErrors),
              unexpectedAs500("bulkUpdateCustomers")
            )
          }).pipe(Effect.provide(services))
        )
    })
)
