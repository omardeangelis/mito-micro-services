import "server-only"
import { TRPCError } from "@trpc/server"
import { Data } from "effect"
import { type ContactError, contactErrorCause } from "../contact/errors"
import { type CustomerError, customerErrorToTrpc } from "../customer/errors"
import { type CustomerMissing } from "../../effect/db"

/** The signed-in user has no operator row. */
export class NotAnOperator extends Data.TaggedError("NotAnOperator") {}

/** The operator is deactivated: they may not use the app (AC16, AC25). */
export class OperatorDisabled extends Data.TaggedError("OperatorDisabled") {}

/** The target is an admin, who must be demoted before deactivation (AC3). */
export class OperatorIsAdmin extends Data.TaggedError("OperatorIsAdmin") {}

/** An admin may not deactivate themselves (AC4). */
export class CannotDeactivateSelf extends Data.TaggedError(
  "CannotDeactivateSelf"
) {}

/** The change would leave no admin: at least one must remain (AC18). */
export class LastAdmin extends Data.TaggedError("LastAdmin") {}

export type OperatorError =
  | NotAnOperator
  | OperatorDisabled
  | OperatorIsAdmin
  | CannotDeactivateSelf
  | LastAdmin

/**
 * The `TRPCError` for an operator error, passed to `runTrpc` by the operator
 * middleware and the operator procedures. The customer and contact errors
 * they share go to `customerErrorToTrpc`.
 */
export const operatorErrorToTrpc = (
  error: OperatorError | CustomerError | ContactError | CustomerMissing
): TRPCError => {
  switch (error._tag) {
    case "NotAnOperator":
      return new TRPCError({ code: "BAD_REQUEST" })
    case "OperatorDisabled":
      return new TRPCError({
        code: "UNAUTHORIZED",
        message: "Utente disattivato",
        cause: contactErrorCause("OPERATOR_DISABLED", {}),
      })
    case "OperatorIsAdmin":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Declassa l'admin a operatore prima di disattivarlo",
        cause: contactErrorCause("OPERATOR_IS_ADMIN", {}),
      })
    case "CannotDeactivateSelf":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Non puoi disattivare te stesso",
        cause: contactErrorCause("CANNOT_DEACTIVATE_SELF", {}),
      })
    case "LastAdmin":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Deve restare almeno un admin",
        cause: contactErrorCause("LAST_ADMIN", {}),
      })
    default:
      return customerErrorToTrpc(error)
  }
}
