import { readContactError } from "@mito/domain/contact/errors"
import { describeContactError } from "@/components/custom/contact/describeContactError"

/**
 * The Italian message for the `{ error: code }` a server action returns.
 * Codes that are not contact errors (INVALID_INPUT, UNKNOWN) get the generic
 * message of `describeContactError`.
 */
export const describeActionError = (code: string): string =>
  describeContactError({ data: { contactError: { code, payload: {} } } })

export const isContactErrorCode = (code: string): boolean =>
  readContactError({ data: { contactError: { code, payload: {} } } }) !== null
