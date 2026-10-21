import "server-only"
import { TRPCError } from "@trpc/server"
import { Data } from "effect"
import {
  type ContactError,
  contactErrorCause,
  contactErrorToTrpc,
} from "../contact/errors"
import { type CustomerMissing } from "../../effect/db"

/** The actor may not change the customer's operator (D13). */
export class CustomerAssignmentForbidden extends Data.TaggedError(
  "CustomerAssignmentForbidden"
) {}

/** The handover's target is already the customer's operator (D13). */
export class HandoverSameOperator extends Data.TaggedError(
  "HandoverSameOperator"
) {}

export type CustomerError = CustomerAssignmentForbidden | HandoverSameOperator

/**
 * The `TRPCError` for a customer error, passed to `runTrpc` by the customer
 * procedures written in Effect. The contact errors they share go to
 * `contactErrorToTrpc`.
 */
export const customerErrorToTrpc = (
  error: CustomerError | ContactError | CustomerMissing
): TRPCError => {
  switch (error._tag) {
    case "CustomerAssignmentForbidden":
      return new TRPCError({
        code: "FORBIDDEN",
        message: "Non puoi cambiare l'operatore di questo cliente",
        cause: contactErrorCause("CUSTOMER_ASSIGNMENT_FORBIDDEN", {}),
      })
    case "HandoverSameOperator":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Il cliente è già di questo operatore",
        cause: contactErrorCause("HANDOVER_SAME_OPERATOR", {}),
      })
    default:
      return contactErrorToTrpc(error)
  }
}
