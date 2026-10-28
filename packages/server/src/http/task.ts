import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import * as Api from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { type CustomerMissing, type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { bulkHandleTask } from "../services/contact/bulkHandleTask"
import { changeState } from "../services/contact/changeState"
import { createContact } from "../services/contact/createContact"
import { type ContactError } from "../services/contact/errors"
import { getContactById } from "../services/contact/getContactById"
import { getContacts } from "../services/contact/getContacts"
import {
  getActiveTask,
  listCustomerAlerts,
  listCustomersWithActiveAlerts,
} from "../services/contact/queries"
import { reassign } from "../services/contact/reassign"
import { resolveAlert } from "../services/contact/resolveAlert"
import { setCallback } from "../services/contact/setCallback"
import { setPriority } from "../services/contact/setPriority"
import { unexpectedAs500 } from "./unexpected"

/** An expected failure of the contact services. */
type ServiceError = ContactError | CustomerMissing

/**
 * The error of the contract for each error of the contact services: the same
 * tag, the same fields
 */
const apiErrorOf = {
  ContactNotFound: () => new Api.ContactNotFound(),
  ContactSuperseded: ({ activeTaskId }) =>
    new Api.ContactSuperseded({ activeTaskId }),
  ContactForbidden: ({ assignee }) => new Api.ContactForbidden({ assignee }),
  TransitionRejected: ({ from, to }) =>
    new Api.TransitionRejected({ from, to }),
  AlertConfirmationRequired: ({ alert }) =>
    new Api.AlertConfirmationRequired({ alert }),
  AlertNotFound: () => new Api.AlertNotFound(),
  CallbackNotAllowed: ({ state }) => new Api.CallbackNotAllowed({ state }),
  DeadlineInPast: () => new Api.DeadlineInPast(),
  CustomerNotFound: () => new Api.CustomerNotFound(),
  CustomerUnassigned: () => new Api.CustomerUnassigned(),
  ContactAlreadyActive: ({ activeTaskId }) =>
    new Api.ContactAlreadyActive({ activeTaskId }),
  OperatorNotFound: () => new Api.OperatorNotFound(),
  CustomerMissing: ({ customerId }) => new Api.CustomerMissing({ customerId }),
} satisfies {
  readonly [Tag in ServiceError["_tag"]]: (
    error: Extract<ServiceError, { _tag: Tag }>
  ) => Api.ApiError
}

/** The error of the contract for the service error `E`. */
type ApiErrorOf<E> = E extends { readonly _tag: keyof typeof apiErrorOf }
  ? ReturnType<(typeof apiErrorOf)[E["_tag"]]>
  : never

const isServiceError = (error: unknown): error is ServiceError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof error._tag === "string" &&
  Object.hasOwn(apiErrorOf, error._tag)

/**
 * Turns the errors of a contact service into those of the contract, as
 * `contactErrorToTrpc` turns them into `TRPCError`s: the rest (`DbError`) goes
 * on to `unexpectedAs500`
 */
const asApiErrors = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, Exclude<E, ServiceError> | ApiErrorOf<E>, R> =>
  self.pipe(
    Effect.catchIf(
      (error): error is Extract<E, ServiceError> => isServiceError(error),
      (error) =>
        // Each entry takes the error of its own tag
        Effect.fail(
          (apiErrorOf[error._tag] as (error: ServiceError) => Api.ApiError)(
            error
          )
        )
    )
  ) as Effect.Effect<A, Exclude<E, ServiceError> | ApiErrorOf<E>, R>

/**
 * The group `task`: adapters of the services the procedures of the tRPC
 * router `task` call, with no logic of their own (H16)
 */
export const taskLayer = HttpApiBuilder.group(MitoApi, "task", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers
      .handle("getCustomersWithActiveAlerts", ({ payload }) =>
        listCustomersWithActiveAlerts([...payload.customerIds]).pipe(
          unexpectedAs500("getCustomersWithActiveAlerts"),
          Effect.provide(services)
        )
      )
      .handle("getActiveTask", ({ params }) =>
        getActiveTask(params.id).pipe(
          unexpectedAs500("getActiveTask"),
          Effect.provide(services)
        )
      )
      .handle("getCustomerAlerts", ({ params }) =>
        listCustomerAlerts(params.id).pipe(
          unexpectedAs500("getCustomerAlerts"),
          Effect.provide(services)
        )
      )
      .handle("getContacts", ({ payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          // The defaults of the procedure's input: the contract has the same
          // limits, so the payload always passes
          const filters = getContactsInput.parse(payload)
          return yield* getContacts({ ...filters, actor }).pipe(
            unexpectedAs500("getContacts")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("getContactById", ({ params }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* getContactById({ id: params.id, actor }).pipe(
            asApiErrors,
            unexpectedAs500("getContactById")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("createContact", ({ payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* createContact({ ...payload, actor }).pipe(
            asApiErrors,
            unexpectedAs500("createContact")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("changeState", ({ params, payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* changeState({
            taskId: params.id,
            ...payload,
            actor,
          }).pipe(asApiErrors, unexpectedAs500("changeState"))
        }).pipe(Effect.provide(services))
      )
      .handle("setPriority", ({ params, payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          yield* setPriority({
            taskId: params.id,
            priority: payload.priority,
            actor,
          }).pipe(asApiErrors, unexpectedAs500("setPriority"))
        }).pipe(Effect.provide(services))
      )
      .handle("reassign", ({ params, payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* reassign({
            taskId: params.id,
            operatorId: payload.operatorId,
            actor,
          }).pipe(asApiErrors, unexpectedAs500("reassign"))
        }).pipe(Effect.provide(services))
      )
      .handle("setCallback", ({ params, payload }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* setCallback({
            taskId: params.id,
            deadline: payload.deadline,
            // An empty message is no message, as in the procedure
            message: payload.message?.length ? payload.message : null,
            replacesAlertId: payload.replacesAlertId,
            actor,
          }).pipe(asApiErrors, unexpectedAs500("setCallback"))
        }).pipe(Effect.provide(services))
      )
      .handle("resolveAlert", ({ params, query }) =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* resolveAlert({
            alertId: params.id,
            actor,
            source: query.source,
          }).pipe(asApiErrors, unexpectedAs500("resolveAlert"))
        }).pipe(Effect.provide(services))
      )
      .handle("bulkHandleTask", ({ payload }) =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          yield* bulkHandleTask({
            operatorId: payload.operatorId,
            customerIds: [...payload.customerIds],
            // The defaults of the procedure's input
            state: payload.state ?? "chiamare",
            resolveAlertCustomerIds: [
              ...(payload.resolveAlertCustomerIds ?? []),
            ],
            actorOperatorId: operator.id,
          }).pipe(asApiErrors, unexpectedAs500("bulkHandleTask"))
        }).pipe(Effect.provide(services))
      )
  })
)
