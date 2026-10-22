import "server-only"
import { TRPCError } from "@trpc/server"
import { Data } from "effect"

/** The signed-in user has no operator row. */
export class NotAnOperator extends Data.TaggedError("NotAnOperator") {}

export type OperatorError = NotAnOperator

/** The `TRPCError` for an operator error, passed to `runTrpc` by the operator middleware. */
export const operatorErrorToTrpc = (error: OperatorError): TRPCError => {
  switch (error._tag) {
    case "NotAnOperator":
      return new TRPCError({ code: "BAD_REQUEST" })
  }
}
