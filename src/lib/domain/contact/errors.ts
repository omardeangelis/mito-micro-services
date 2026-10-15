import type { TaskStatus } from "@/lib/types/schemas"

/**
 * The codes of the errors the contact and customer services return to the
 * interface. Plain TypeScript: client components import this module.
 */
export const contactErrorCodes = [
  "CONTACT_NOT_FOUND",
  "CONTACT_SUPERSEDED",
  "CONTACT_FORBIDDEN",
  "CONTACT_TRANSITION_REJECTED",
  "ALERT_CONFIRMATION_REQUIRED",
  "ALERT_NOT_FOUND",
  "CALLBACK_NOT_ALLOWED",
  "DEADLINE_IN_PAST",
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_UNASSIGNED",
  "CONTACT_ALREADY_ACTIVE",
  "OPERATOR_NOT_FOUND",
  "CUSTOMER_ASSIGNMENT_FORBIDDEN",
  "HANDOVER_SAME_OPERATOR",
] as const

export type ContactErrorCode = (typeof contactErrorCodes)[number]

type NoPayload = Record<string, never>

/** The data each code carries to the interface. */
export type ContactErrorPayloads = {
  CONTACT_NOT_FOUND: NoPayload
  /** The customer's active contact, if there is one (AC27). */
  CONTACT_SUPERSEDED: { readonly activeTaskId: number | null }
  /** The contact's operator, or null when it has none: "Non assegnato". */
  CONTACT_FORBIDDEN: { readonly assignee: string | null }
  CONTACT_TRANSITION_REJECTED: {
    readonly from: TaskStatus | null
    readonly to: TaskStatus
  }
  /** The open alert the change would close (AC36, AC37, AC44). */
  ALERT_CONFIRMATION_REQUIRED: {
    readonly alert: {
      readonly id: number
      readonly deadline: Date
      readonly message: string | null
    }
  }
  ALERT_NOT_FOUND: NoPayload
  /** The contact's current state (AC46). */
  CALLBACK_NOT_ALLOWED: { readonly state: TaskStatus | null }
  DEADLINE_IN_PAST: NoPayload
  CUSTOMER_NOT_FOUND: NoPayload
  CUSTOMER_UNASSIGNED: NoPayload
  /** The contact the customer already has (AC67). */
  CONTACT_ALREADY_ACTIVE: { readonly activeTaskId: number }
  OPERATOR_NOT_FOUND: NoPayload
  CUSTOMER_ASSIGNMENT_FORBIDDEN: NoPayload
  HANDOVER_SAME_OPERATOR: NoPayload
}

export type ContactErrorPayload<C extends ContactErrorCode> =
  ContactErrorPayloads[C]

/** An error of the contact or customer services, as the interface reads it. */
export type ContactErrorData = {
  [C in ContactErrorCode]: { code: C; payload: ContactErrorPayload<C> }
}[ContactErrorCode]

/**
 * The key that marks the `cause` the server puts in a `TRPCError`. A plain
 * string key: tRPC copies the cause's enumerable keys into the `Error` it
 * builds, and a symbol would not survive the copy.
 */
export const CONTACT_ERROR_MARKER = "__contactError"

/** The `cause` of a `TRPCError` raised for a contact or customer error. */
export type ContactErrorCause<C extends ContactErrorCode = ContactErrorCode> = {
  readonly [CONTACT_ERROR_MARKER]: true
  readonly code: C
  readonly payload: ContactErrorPayload<C>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isContactErrorCode = (value: unknown): value is ContactErrorCode =>
  typeof value === "string" &&
  (contactErrorCodes as readonly string[]).includes(value)

/** `{ code, payload }` as a new plain object, or null when malformed. */
const toData = (value: Record<string, unknown>): ContactErrorData | null =>
  isContactErrorCode(value.code) && isRecord(value.payload)
    ? ({ code: value.code, payload: value.payload } as ContactErrorData)
    : null

/**
 * `{ code, payload }` of a cause marked by `contactErrorCause`, or null for
 * any other cause (a `DbError` has a `code` too, but no marker).
 */
export const contactErrorFromCause = (
  cause: unknown
): ContactErrorData | null =>
  isRecord(cause) && cause[CONTACT_ERROR_MARKER] === true ? toData(cause) : null

/**
 * The contact error in an error from a tRPC call, or null. Reads both shapes:
 * - over HTTP, a `TRPCClientError` with `data.contactError`;
 * - in-process from a Server Component, a `TRPCClientError` whose `cause` is
 *   the `TRPCError`, or that `TRPCError` itself.
 */
export const readContactError = (err: unknown): ContactErrorData | null => {
  if (!isRecord(err)) return null
  if (isRecord(err.data) && "contactError" in err.data) {
    return isRecord(err.data.contactError)
      ? toData(err.data.contactError)
      : null
  }
  const cause = err.cause
  return (
    contactErrorFromCause(cause) ??
    (isRecord(cause) ? contactErrorFromCause(cause.cause) : null)
  )
}
