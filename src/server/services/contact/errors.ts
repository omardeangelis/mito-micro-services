import "server-only"
import { TRPCError } from "@trpc/server"
import { Data } from "effect"
import {
  CONTACT_ERROR_MARKER,
  type ContactErrorCause,
  type ContactErrorCode,
  type ContactErrorPayload,
} from "@/lib/domain/contact/errors"

/** The contact doesn't exist. */
export class ContactNotFound extends Data.TaggedError("ContactNotFound") {}

/** The contact is no longer the customer's active one (AC27). */
export class ContactSuperseded extends Data.TaggedError("ContactSuperseded")<
  ContactErrorPayload<"CONTACT_SUPERSEDED">
> {}

/** The actor may not edit the contact (AC49, AC51). */
export class ContactForbidden extends Data.TaggedError("ContactForbidden")<
  ContactErrorPayload<"CONTACT_FORBIDDEN">
> {}

/** The state change isn't allowed (AC30). */
export class TransitionRejected extends Data.TaggedError("TransitionRejected")<
  ContactErrorPayload<"CONTACT_TRANSITION_REJECTED">
> {}

/** The contact has an open alert the user hasn't confirmed to close. */
export class AlertConfirmationRequired extends Data.TaggedError(
  "AlertConfirmationRequired"
)<ContactErrorPayload<"ALERT_CONFIRMATION_REQUIRED">> {}

/** The alert doesn't exist, or is no longer open (AC29). */
export class AlertNotFound extends Data.TaggedError("AlertNotFound") {}

/** A callback can't be set in the contact's state (AC46). */
export class CallbackNotAllowed extends Data.TaggedError("CallbackNotAllowed")<
  ContactErrorPayload<"CALLBACK_NOT_ALLOWED">
> {}

/** The callback's deadline is in the past (AC44). */
export class DeadlineInPast extends Data.TaggedError("DeadlineInPast") {}

/** The customer doesn't exist. */
export class CustomerNotFound extends Data.TaggedError("CustomerNotFound") {}

/** The customer has no operator (AC67). */
export class CustomerUnassigned extends Data.TaggedError(
  "CustomerUnassigned"
) {}

/** The customer already has an active contact (AC67). */
export class ContactAlreadyActive extends Data.TaggedError(
  "ContactAlreadyActive"
)<ContactErrorPayload<"CONTACT_ALREADY_ACTIVE">> {}

/** The operator doesn't exist (AC47). */
export class OperatorNotFound extends Data.TaggedError("OperatorNotFound") {}

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
    message: "La data del richiamo è passata",
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
 * The `TRPCError` for a contact error, passed to `runTrpc`. Its `cause` is
 * `{ code, payload }`, the payload being the error's fields.
 */
export const contactErrorToTrpc = (error: ContactError): TRPCError => {
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
