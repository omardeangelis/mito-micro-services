import { Schema } from "effect"

/**
 * The errors the endpoints declare: they travel as `{ _tag, ... }` with the
 * status of the tRPC code of today, and the client decodes each one into its
 * class (H9 of brain/chore/fase-2-httpapi.md). The texts the user reads are
 * the client's (`describeApiError` in apps/web), as `describeContactError`
 * does today.
 */

/** No session: no better-auth cookie, or an expired one (tRPC UNAUTHORIZED). */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 }
) {}

/** The signed-in user has no operator row (tRPC BAD_REQUEST). */
export class NotAnOperator extends Schema.TaggedError<NotAnOperator>()(
  "NotAnOperator",
  {},
  { httpApiStatus: 400 }
) {}

/** The operator is deactivated: they may not use the app (tRPC UNAUTHORIZED). */
export class OperatorDisabled extends Schema.TaggedError<OperatorDisabled>()(
  "OperatorDisabled",
  {},
  { httpApiStatus: 401 }
) {}

/** An admin-only endpoint called by an operator (tRPC FORBIDDEN, admin-only). */
export class NotAdmin extends Schema.TaggedError<NotAdmin>()(
  "NotAdmin",
  {},
  { httpApiStatus: 403 }
) {}

/**
 * The operator to write, or the one a customer goes to, doesn't exist or can't
 * work: disabled, or the system operator (tRPC BAD_REQUEST, `OPERATOR_NOT_FOUND`).
 */
export class OperatorNotFound extends Schema.TaggedError<OperatorNotFound>()(
  "OperatorNotFound",
  {},
  { httpApiStatus: 400 }
) {}

/** The customer doesn't exist (tRPC NOT_FOUND, `CUSTOMER_NOT_FOUND`). */
export class CustomerNotFound extends Schema.TaggedError<CustomerNotFound>()(
  "CustomerNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/**
 * The operator may not change the customer's operator (D13; tRPC FORBIDDEN,
 * `CUSTOMER_ASSIGNMENT_FORBIDDEN`).
 */
export class CustomerAssignmentForbidden extends Schema.TaggedError<CustomerAssignmentForbidden>()(
  "CustomerAssignmentForbidden",
  {},
  { httpApiStatus: 403 }
) {}

/**
 * The handover's target is already the customer's operator (D13; tRPC
 * BAD_REQUEST, `HANDOVER_SAME_OPERATOR`).
 */
export class HandoverSameOperator extends Schema.TaggedError<HandoverSameOperator>()(
  "HandoverSameOperator",
  {},
  { httpApiStatus: 400 }
) {}

/**
 * A customer of a bulk assignment doesn't exist (tRPC BAD_REQUEST, "Cliente
 * non trovato: <id>"): the customers before it stay assigned.
 */
export class CustomerMissing extends Schema.TaggedError<CustomerMissing>()(
  "CustomerMissing",
  { customerId: Schema.NullOr(Schema.String) },
  { httpApiStatus: 400 }
) {}

const apiErrors = [
  Unauthorized,
  NotAnOperator,
  OperatorDisabled,
  NotAdmin,
  OperatorNotFound,
  CustomerNotFound,
  CustomerAssignmentForbidden,
  HandoverSameOperator,
  CustomerMissing,
] as const

/** An error some endpoint declares. */
export type ApiError = InstanceType<(typeof apiErrors)[number]>

/** Whether `u` is an error an endpoint declares, decoded by the client. */
export const isApiError = (u: unknown): u is ApiError =>
  apiErrors.some((error) => u instanceof error)
