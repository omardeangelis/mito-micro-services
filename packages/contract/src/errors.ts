import { Schema } from "effect"
import { TaskStatus } from "./schemas"

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

/** The contact doesn't exist (tRPC NOT_FOUND, `CONTACT_NOT_FOUND`). */
export class ContactNotFound extends Schema.TaggedError<ContactNotFound>()(
  "ContactNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/**
 * The operator may not create or edit the contact (AC49, AC51; tRPC
 * FORBIDDEN, `CONTACT_FORBIDDEN`): `assignee` is who it belongs to, null when
 * nobody
 */
export class ContactForbidden extends Schema.TaggedError<ContactForbidden>()(
  "ContactForbidden",
  { assignee: Schema.NullOr(Schema.String) },
  { httpApiStatus: 403 }
) {}

/**
 * The customer has no operator, so no contact (AC67; tRPC
 * PRECONDITION_FAILED, `CUSTOMER_UNASSIGNED`).
 */
export class CustomerUnassigned extends Schema.TaggedError<CustomerUnassigned>()(
  "CustomerUnassigned",
  {},
  { httpApiStatus: 412 }
) {}

/**
 * The customer already has an active contact, `activeTaskId` (AC67; tRPC
 * CONFLICT, `CONTACT_ALREADY_ACTIVE`).
 */
export class ContactAlreadyActive extends Schema.TaggedError<ContactAlreadyActive>()(
  "ContactAlreadyActive",
  { activeTaskId: Schema.Number },
  { httpApiStatus: 409 }
) {}

/**
 * The contact is no longer the customer's active one, `activeTaskId` is (AC27;
 * tRPC CONFLICT, `CONTACT_SUPERSEDED`).
 */
export class ContactSuperseded extends Schema.TaggedError<ContactSuperseded>()(
  "ContactSuperseded",
  { activeTaskId: Schema.NullOr(Schema.Number) },
  { httpApiStatus: 409 }
) {}

/**
 * The state change isn't allowed (AC30; tRPC BAD_REQUEST,
 * `CONTACT_TRANSITION_REJECTED`).
 */
export class TransitionRejected extends Schema.TaggedError<TransitionRejected>()(
  "TransitionRejected",
  { from: Schema.NullOr(TaskStatus), to: TaskStatus },
  { httpApiStatus: 400 }
) {}

/**
 * The contact has an open alert the user hasn't confirmed to close (tRPC
 * PRECONDITION_FAILED, `ALERT_CONFIRMATION_REQUIRED`): the client asks, then
 * sends its id
 */
export class AlertConfirmationRequired extends Schema.TaggedError<AlertConfirmationRequired>()(
  "AlertConfirmationRequired",
  {
    alert: Schema.Struct({
      id: Schema.Number,
      deadline: Schema.Date,
      message: Schema.NullOr(Schema.String),
    }),
  },
  { httpApiStatus: 412 }
) {}

/**
 * The alert doesn't exist (AC29; tRPC NOT_FOUND, `ALERT_NOT_FOUND`). One
 * already closed is no error.
 */
export class AlertNotFound extends Schema.TaggedError<AlertNotFound>()(
  "AlertNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/**
 * A callback can't be set in the contact's state (AC46; tRPC BAD_REQUEST,
 * `CALLBACK_NOT_ALLOWED`).
 */
export class CallbackNotAllowed extends Schema.TaggedError<CallbackNotAllowed>()(
  "CallbackNotAllowed",
  { state: Schema.NullOr(TaskStatus) },
  { httpApiStatus: 400 }
) {}

/**
 * The callback's deadline is today or earlier (AC44, D22; tRPC BAD_REQUEST,
 * `DEADLINE_IN_PAST`).
 */
export class DeadlineInPast extends Schema.TaggedError<DeadlineInPast>()(
  "DeadlineInPast",
  {},
  { httpApiStatus: 400 }
) {}

/** The practice doesn't exist (tRPC NOT_FOUND, `PRACTICE_NOT_FOUND`). */
export class PracticeNotFound extends Schema.TaggedError<PracticeNotFound>()(
  "PracticeNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/** A practice with this `praticaId` exists (tRPC CONFLICT, `PRACTICE_EXISTS`). */
export class PracticeExists extends Schema.TaggedError<PracticeExists>()(
  "PracticeExists",
  {},
  { httpApiStatus: 409 }
) {}

/**
 * A customer the new practice adds already exists (tRPC CONFLICT,
 * `CUSTOMER_EXISTS`).
 */
export class CustomerExists extends Schema.TaggedError<CustomerExists>()(
  "CustomerExists",
  {},
  { httpApiStatus: 409 }
) {}

/** The chat doesn't exist, or went with its last note (tRPC NOT_FOUND). */
export class ChatMissing extends Schema.TaggedError<ChatMissing>()(
  "ChatMissing",
  { chatId: Schema.Number },
  { httpApiStatus: 404 }
) {}

/** The note doesn't exist any more (tRPC NOT_FOUND). */
export class MessageMissing extends Schema.TaggedError<MessageMissing>()(
  "MessageMissing",
  { messageId: Schema.Number },
  { httpApiStatus: 404 }
) {}

/** Only the author of a note deletes it, not an admin either (tRPC FORBIDDEN). */
export class NotMessageAuthor extends Schema.TaggedError<NotMessageAuthor>()(
  "NotMessageAuthor",
  { messageId: Schema.Number },
  { httpApiStatus: 403 }
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
  ContactNotFound,
  ContactForbidden,
  CustomerUnassigned,
  ContactAlreadyActive,
  ContactSuperseded,
  TransitionRejected,
  AlertConfirmationRequired,
  AlertNotFound,
  CallbackNotAllowed,
  DeadlineInPast,
  PracticeNotFound,
  PracticeExists,
  CustomerExists,
  ChatMissing,
  MessageMissing,
  NotMessageAuthor,
] as const

/** An error some endpoint declares. */
export type ApiError = InstanceType<(typeof apiErrors)[number]>

/** Whether `u` is an error an endpoint declares, decoded by the client. */
export const isApiError = (u: unknown): u is ApiError =>
  apiErrors.some((error) => u instanceof error)
