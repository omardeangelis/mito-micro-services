import { TRPCError } from "@trpc/server"
import { Data } from "effect"
import { contactErrorCause } from "../contact/errors"
import { type CustomerMissing } from "../../effect/db"

/** The practice doesn't exist. */
export class PracticeNotFound extends Data.TaggedError("PracticeNotFound") {}

/** A practice with this `praticaId` already exists. */
export class PracticeExists extends Data.TaggedError("PracticeExists") {}

/** A customer the new practice adds already exists. */
export class CustomerExists extends Data.TaggedError("CustomerExists") {}

export type PracticeError = PracticeNotFound | PracticeExists | CustomerExists

/**
 * The `TRPCError` for a practice error, passed to `runTrpc` by the practice
 * procedures. `CustomerMissing` (the holder of a new practice doesn't exist)
 * carries `CUSTOMER_NOT_FOUND`, so the form says "Cliente non trovato".
 */
export const practiceErrorToTrpc = (
  error: PracticeError | CustomerMissing
): TRPCError => {
  switch (error._tag) {
    case "PracticeNotFound":
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Pratica non trovata",
        cause: contactErrorCause("PRACTICE_NOT_FOUND", {}),
      })
    case "PracticeExists":
      return new TRPCError({
        code: "CONFLICT",
        message: "Questa pratica esiste già",
        cause: contactErrorCause("PRACTICE_EXISTS", {}),
      })
    case "CustomerExists":
      return new TRPCError({
        code: "CONFLICT",
        message: "Un cliente collegato esiste già",
        cause: contactErrorCause("CUSTOMER_EXISTS", {}),
      })
    case "CustomerMissing":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `Cliente non trovato: ${error.customerId}`,
        cause: contactErrorCause("CUSTOMER_NOT_FOUND", {}),
      })
  }
}
