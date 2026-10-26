import { TRPCError } from "@trpc/server"
import { Effect } from "effect"
import superjson from "superjson"
import { describe, expect, it } from "vitest"
import { type ContactErrorData } from "@mito/domain/contact/errors"
import { appRouter } from "../../../api/root"
import { CustomerMissing } from "../../../effect/db"
import { runTrpc } from "../../../effect/trpc"
import {
  CustomerExists,
  type PracticeError,
  practiceErrorToTrpc,
  PracticeExists,
  PracticeNotFound,
} from "../errors"

type Failure = PracticeError | CustomerMissing

/** The error as the client receives it over HTTP: shaped, then serialized. */
const overHttp = (error: TRPCError) => {
  const shape = appRouter.getErrorShape({
    error,
    type: "mutation",
    path: "pratiche.createPratica",
    input: undefined,
    ctx: undefined,
  })
  return superjson.parse<typeof shape>(superjson.stringify(shape))
}

/** The error `runTrpc` throws for a program that fails with `error`. */
const thrownBy = async (error: Failure) => {
  try {
    await runTrpc(Effect.fail(error), practiceErrorToTrpc)
  } catch (thrown) {
    return thrown as TRPCError
  }
  throw new Error("runTrpc did not throw")
}

/** One case per `_tag`: the record fails to compile when one is missing. */
const cases: Record<
  Failure["_tag"],
  { error: Failure; trpc: TRPCError["code"]; expected: ContactErrorData }
> = {
  PracticeNotFound: {
    error: new PracticeNotFound(),
    trpc: "NOT_FOUND",
    expected: { code: "PRACTICE_NOT_FOUND", payload: {} },
  },
  PracticeExists: {
    error: new PracticeExists(),
    trpc: "CONFLICT",
    expected: { code: "PRACTICE_EXISTS", payload: {} },
  },
  CustomerExists: {
    error: new CustomerExists(),
    trpc: "CONFLICT",
    expected: { code: "CUSTOMER_EXISTS", payload: {} },
  },
  CustomerMissing: {
    error: new CustomerMissing({ customerId: "inesistente" }),
    trpc: "BAD_REQUEST",
    expected: { code: "CUSTOMER_NOT_FOUND", payload: {} },
  },
}

describe("practice errors at the procedure edge", () => {
  it.each(Object.entries(cases))(
    "%s becomes a TRPCError with its code and { code, payload } in the cause",
    async (_tag, { error, trpc, expected }) => {
      const thrown = await thrownBy(error)
      expect(thrown).toBeInstanceOf(TRPCError)
      expect(thrown.code).toBe(trpc)
      expect(thrown.cause).toMatchObject(expected)
    }
  )
})

describe("practice errors over HTTP", () => {
  it.each(Object.entries(cases))(
    "%s carries its code to the client",
    (_tag, { error, expected }) => {
      const received = overHttp(practiceErrorToTrpc(error))
      expect(received.data.contactError).toEqual(expected)
    }
  )
})
