import { TRPCError } from "@trpc/server"
import { Schema } from "effect"
import { taskStatus } from "@mito/db/schema/task"
import {
  CONTACT_ERROR_MARKER,
  type ContactErrorCause,
  type ContactErrorCode,
  type ContactErrorPayload,
} from "@mito/domain/contact/errors"
import { type CustomerMissing } from "../../effect/db"

/**
 * The schemas of a code's payload, checked against the type the interface
 * reads (`ContactErrorPayload`): the class's fields are its payload.
 */
const payloadOf =
  <C extends ContactErrorCode>() =>
  <const F extends Schema.Struct.Fields>(
    fields: F &
      ([Schema.Struct.Type<F>] extends [ContactErrorPayload<C>]
        ? [ContactErrorPayload<C>] extends [Schema.Struct.Type<F>]
          ? unknown
          : never
        : never)
  ): F =>
    fields

const TaskStatus = Schema.Literals(taskStatus)

/** The contact doesn't exist. */
export class ContactNotFound extends Schema.TaggedError<ContactNotFound>()(
  "ContactNotFound",
  {}
) {}

/** The contact is no longer the customer's active one (AC27). */
export class ContactSuperseded extends Schema.TaggedError<ContactSuperseded>()(
  "ContactSuperseded",
  payloadOf<"CONTACT_SUPERSEDED">()({
    activeTaskId: Schema.NullOr(Schema.Number),
  })
) {}

/** The actor may not edit the contact (AC49, AC51). */
export class ContactForbidden extends Schema.TaggedError<ContactForbidden>()(
  "ContactForbidden",
  payloadOf<"CONTACT_FORBIDDEN">()({ assignee: Schema.NullOr(Schema.String) })
) {}

/** The state change isn't allowed (AC30). */
export class TransitionRejected extends Schema.TaggedError<TransitionRejected>()(
  "TransitionRejected",
  payloadOf<"CONTACT_TRANSITION_REJECTED">()({
    from: Schema.NullOr(TaskStatus),
    to: TaskStatus,
  })
) {}

/** The contact has an open alert the user hasn't confirmed to close. */
export class AlertConfirmationRequired extends Schema.TaggedError<AlertConfirmationRequired>()(
  "AlertConfirmationRequired",
  payloadOf<"ALERT_CONFIRMATION_REQUIRED">()({
    alert: Schema.Struct({
      id: Schema.Number,
      // Any Date, as before: `Schema.Date` refuses an invalid one
      deadline: Schema.instanceOf(Date),
      message: Schema.NullOr(Schema.String),
    }),
  })
) {}

/**
 * The alert doesn't exist (AC29). An alert already closed is not an error:
 * `resolveAlert` returns `{ resolved: false }` (F14).
 */
export class AlertNotFound extends Schema.TaggedError<AlertNotFound>()(
  "AlertNotFound",
  {}
) {}

/** A callback can't be set in the contact's state (AC46). */
export class CallbackNotAllowed extends Schema.TaggedError<CallbackNotAllowed>()(
  "CallbackNotAllowed",
  payloadOf<"CALLBACK_NOT_ALLOWED">()({ state: Schema.NullOr(TaskStatus) })
) {}

/** The callback's deadline is today or earlier (AC44, D22). */
export class DeadlineInPast extends Schema.TaggedError<DeadlineInPast>()(
  "DeadlineInPast",
  {}
) {}

/** The customer doesn't exist. */
export class CustomerNotFound extends Schema.TaggedError<CustomerNotFound>()(
  "CustomerNotFound",
  {}
) {}

/** The customer has no operator (AC67). */
export class CustomerUnassigned extends Schema.TaggedError<CustomerUnassigned>()(
  "CustomerUnassigned",
  {}
) {}

/** The customer already has an active contact (AC67). */
export class ContactAlreadyActive extends Schema.TaggedError<ContactAlreadyActive>()(
  "ContactAlreadyActive",
  payloadOf<"CONTACT_ALREADY_ACTIVE">()({ activeTaskId: Schema.Number })
) {}

/** The operator doesn't exist (AC47). */
export class OperatorNotFound extends Schema.TaggedError<OperatorNotFound>()(
  "OperatorNotFound",
  {}
) {}

export type ContactError =
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | TransitionRejected
  | AlertConfirmationRequired
  | AlertNotFound
  | CallbackNotAllowed
  | DeadlineInPast
  | CustomerNotFound
  | CustomerUnassigned
  | ContactAlreadyActive
  | OperatorNotFound

/**
 * The `cause` of a `TRPCError` for a contact or customer error: `{ code,
 * payload }` with the marker the `errorFormatter` and `readContactError`
 * recognize. The only place that sets the marker.
 */
export const contactErrorCause = <C extends ContactErrorCode>(
  code: C,
  payload: ContactErrorPayload<C>
): ContactErrorCause<C> => ({ [CONTACT_ERROR_MARKER]: true, code, payload })

type TrpcEntry = {
  readonly code: ContactErrorCode
  readonly trpc: TRPCError["code"]
  readonly message: string
}

const trpcErrors: { readonly [Tag in ContactError["_tag"]]: TrpcEntry } = {
  ContactNotFound: {
    code: "CONTACT_NOT_FOUND",
    trpc: "NOT_FOUND",
    message: "Contatto non trovato",
  },
  ContactSuperseded: {
    code: "CONTACT_SUPERSEDED",
    trpc: "CONFLICT",
    message: "Il contatto non è più attivo",
  },
  ContactForbidden: {
    code: "CONTACT_FORBIDDEN",
    trpc: "FORBIDDEN",
    message: "Non puoi modificare questo contatto",
  },
  TransitionRejected: {
    code: "CONTACT_TRANSITION_REJECTED",
    trpc: "BAD_REQUEST",
    message: "Cambio di stato non consentito",
  },
  AlertConfirmationRequired: {
    code: "ALERT_CONFIRMATION_REQUIRED",
    trpc: "PRECONDITION_FAILED",
    message: "Il contatto ha un alert aperto da confermare",
  },
  AlertNotFound: {
    code: "ALERT_NOT_FOUND",
    trpc: "NOT_FOUND",
    message: "Alert non trovato",
  },
  CallbackNotAllowed: {
    code: "CALLBACK_NOT_ALLOWED",
    trpc: "BAD_REQUEST",
    message: "Richiamo non disponibile in questo stato",
  },
  DeadlineInPast: {
    code: "DEADLINE_IN_PAST",
    trpc: "BAD_REQUEST",
    message: "Il richiamo si imposta da domani",
  },
  CustomerNotFound: {
    code: "CUSTOMER_NOT_FOUND",
    trpc: "NOT_FOUND",
    message: "Cliente non trovato",
  },
  CustomerUnassigned: {
    code: "CUSTOMER_UNASSIGNED",
    trpc: "PRECONDITION_FAILED",
    message: "Cliente non assegnato",
  },
  ContactAlreadyActive: {
    code: "CONTACT_ALREADY_ACTIVE",
    trpc: "CONFLICT",
    message: "Il cliente ha già un contatto attivo",
  },
  OperatorNotFound: {
    code: "OPERATOR_NOT_FOUND",
    trpc: "BAD_REQUEST",
    message: "Operatore non trovato",
  },
}

/**
 * The `TRPCError` for a contact error, passed to `runTrpc` by every contact
 * procedure. Its `cause` is `{ code, payload }`, the payload being the error's
 * fields. `CustomerMissing` (the contact has no customer) is a plain
 * BAD_REQUEST, as the bulk assignment reports it.
 */
export const contactErrorToTrpc = (
  error: ContactError | CustomerMissing
): TRPCError => {
  if (error._tag === "CustomerMissing") {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: `Cliente non trovato: ${error.customerId}`,
    })
  }
  const { _tag, ...fields } = error
  const { code, trpc, message } = trpcErrors[_tag]
  // Each class declares its fields as the payload of its code
  const payload = fields as ContactErrorPayload<typeof code>
  return new TRPCError({
    code: trpc,
    message,
    cause: contactErrorCause(code, payload),
  })
}
