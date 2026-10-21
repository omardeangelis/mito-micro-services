import { TRPCClientError } from "@trpc/client"
import { callProcedure, TRPCError } from "@trpc/server"
import { Effect } from "effect"
import superjson from "superjson"
import { describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"
import {
  type ContactErrorData,
  readContactError,
} from "@mito/domain/contact/errors"
import { appRouter } from "../../../api/root"
import { createTRPCRouter, publicProcedure } from "../../../api/trpc"
import { DbError } from "../../../effect/db"
import { runTrpc } from "../../../effect/trpc"
import {
  AlertConfirmationRequired,
  AlertNotFound,
  CallbackNotAllowed,
  ContactAlreadyActive,
  type ContactError,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  contactErrorToTrpc,
  CustomerNotFound,
  CustomerUnassigned,
  DeadlineInPast,
  OperatorNotFound,
  TransitionRejected,
} from "../errors"

/** The error as the client receives it over HTTP: shaped, then serialized. */
const overHttp = (error: ReturnType<typeof contactErrorToTrpc>) => {
  const shape = appRouter.getErrorShape({
    error,
    type: "mutation",
    path: "task.changeState",
    input: undefined,
    ctx: undefined,
  })
  return superjson.parse<typeof shape>(superjson.stringify(shape))
}

/** The error `runTrpc` throws for a program that fails with `error`. */
const thrownBy = async (error: ContactError) => {
  try {
    await runTrpc(Effect.fail(error), contactErrorToTrpc)
  } catch (thrown) {
    return thrown as TRPCError
  }
  throw new Error("runTrpc did not throw")
}

const deadline = new Date("2026-10-20T08:30:00.000Z")

/** One case per `_tag`: the record fails to compile when one is missing. */
const cases: Record<
  ContactError["_tag"],
  { error: ContactError; trpc: TRPCError["code"]; expected: ContactErrorData }
> = {
  ContactNotFound: {
    error: new ContactNotFound(),
    trpc: "NOT_FOUND",
    expected: { code: "CONTACT_NOT_FOUND", payload: {} },
  },
  ContactSuperseded: {
    error: new ContactSuperseded({ activeTaskId: null }),
    trpc: "CONFLICT",
    expected: { code: "CONTACT_SUPERSEDED", payload: { activeTaskId: null } },
  },
  ContactForbidden: {
    error: new ContactForbidden({ assignee: "Mario Rossi" }),
    trpc: "FORBIDDEN",
    expected: {
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Mario Rossi" },
    },
  },
  TransitionRejected: {
    error: new TransitionRejected({ from: "followup", to: "chiamare" }),
    trpc: "BAD_REQUEST",
    expected: {
      code: "CONTACT_TRANSITION_REJECTED",
      payload: { from: "followup", to: "chiamare" },
    },
  },
  AlertConfirmationRequired: {
    error: new AlertConfirmationRequired({
      alert: { id: 7, deadline, message: "Richiamare dopo le 10" },
    }),
    trpc: "PRECONDITION_FAILED",
    expected: {
      code: "ALERT_CONFIRMATION_REQUIRED",
      payload: { alert: { id: 7, deadline, message: "Richiamare dopo le 10" } },
    },
  },
  AlertNotFound: {
    error: new AlertNotFound(),
    trpc: "NOT_FOUND",
    expected: { code: "ALERT_NOT_FOUND", payload: {} },
  },
  CallbackNotAllowed: {
    error: new CallbackNotAllowed({ state: "chiamare" }),
    trpc: "BAD_REQUEST",
    expected: { code: "CALLBACK_NOT_ALLOWED", payload: { state: "chiamare" } },
  },
  DeadlineInPast: {
    error: new DeadlineInPast(),
    trpc: "BAD_REQUEST",
    expected: { code: "DEADLINE_IN_PAST", payload: {} },
  },
  CustomerNotFound: {
    error: new CustomerNotFound(),
    trpc: "NOT_FOUND",
    expected: { code: "CUSTOMER_NOT_FOUND", payload: {} },
  },
  CustomerUnassigned: {
    error: new CustomerUnassigned(),
    trpc: "PRECONDITION_FAILED",
    expected: { code: "CUSTOMER_UNASSIGNED", payload: {} },
  },
  ContactAlreadyActive: {
    error: new ContactAlreadyActive({ activeTaskId: 9 }),
    trpc: "CONFLICT",
    expected: { code: "CONTACT_ALREADY_ACTIVE", payload: { activeTaskId: 9 } },
  },
  OperatorNotFound: {
    error: new OperatorNotFound(),
    trpc: "BAD_REQUEST",
    expected: { code: "OPERATOR_NOT_FOUND", payload: {} },
  },
}

describe("contact errors at the procedure edge", () => {
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

describe("contact errors over HTTP", () => {
  it("carries the code and payload of a superseded contact to the client", () => {
    const received = overHttp(
      contactErrorToTrpc(new ContactSuperseded({ activeTaskId: 42 }))
    )
    expect(received.data.contactError).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: 42 },
    })
  })

  it("keeps the alert's deadline a Date and its message apart from the error's", () => {
    const received = overHttp(
      contactErrorToTrpc(
        new AlertConfirmationRequired({
          alert: { id: 7, deadline, message: "Richiamare dopo le 10" },
        })
      )
    )
    expect(received.data.contactError).toEqual({
      code: "ALERT_CONFIRMATION_REQUIRED",
      payload: { alert: { id: 7, deadline, message: "Richiamare dopo le 10" } },
    })
    expect(received.message).not.toBe("Richiamare dopo le 10")
  })

  it("leaves contactError null and zodError as it is for a validation error", () => {
    const received = overHttp(
      new TRPCError({
        code: "BAD_REQUEST",
        cause: new ZodError([
          {
            code: "invalid_type",
            expected: "number",
            received: "string",
            path: ["taskId"],
            message: "Expected number, received string",
          },
        ]),
      })
    )
    expect(received.data.zodError).toEqual({
      formErrors: [],
      fieldErrors: { taskId: ["Expected number, received string"] },
    })
    expect(received.data.contactError).toBeNull()
  })

  it("leaves contactError null for a database error, which has a code too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    let thrown: unknown
    try {
      await runTrpc(
        Effect.fail(
          new DbError({
            cause: new Error("duplicate key"),
            message: "duplicate key",
            code: "23505",
          })
        )
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    const received = overHttp(thrown as TRPCError)
    expect(received.data.contactError).toBeNull()
  })

  it("leaves contactError null for a cause with a contact code but no marker", () => {
    const received = overHttp(
      new TRPCError({
        code: "CONFLICT",
        cause: { code: "CONTACT_SUPERSEDED", payload: { activeTaskId: 42 } },
      })
    )
    expect(received.data.contactError).toBeNull()
  })
})

describe("readContactError", () => {
  const expected: ContactErrorData = {
    code: "CONTACT_SUPERSEDED",
    payload: { activeTaskId: 42 },
  }
  const superseded = () =>
    contactErrorToTrpc(new ContactSuperseded({ activeTaskId: 42 }))

  it("reads the error a client receives over HTTP", () => {
    const err = TRPCClientError.from({ error: overHttp(superseded()) })
    expect(readContactError(err)).toEqual(expected)
  })

  it("reads the error a Server Component receives from an in-process call", async () => {
    // What the link of src/trpc/server.ts does
    const router = createTRPCRouter({
      fail: publicProcedure.mutation(() =>
        runTrpc(
          Effect.fail(new ContactSuperseded({ activeTaskId: 42 })),
          contactErrorToTrpc
        )
      ),
    })
    let err: unknown
    try {
      await callProcedure({
        procedures: router._def.procedures,
        path: "fail",
        rawInput: undefined,
        ctx: {},
        type: "mutation",
      })
    } catch (cause) {
      err = TRPCClientError.from(cause as Error)
    }
    expect(err).toBeInstanceOf(TRPCClientError)
    expect(readContactError(err)).toEqual(expected)
  })

  it("reads the TRPCError itself", () => {
    expect(readContactError(superseded())).toEqual(expected)
  })

  it("returns null for an error without a contact error", () => {
    const zod = TRPCClientError.from({
      error: overHttp(new TRPCError({ code: "BAD_REQUEST" })),
    })
    expect(readContactError(zod)).toBeNull()
    expect(readContactError(new Error("boom"))).toBeNull()
    expect(
      readContactError(new TRPCError({ code: "CONFLICT", cause: new Error() }))
    ).toBeNull()
  })

  it("returns null for a plain object that only has a code", () => {
    expect(readContactError({ code: "CONTACT_SUPERSEDED" })).toBeNull()
    expect(
      readContactError({ cause: { code: "CONTACT_SUPERSEDED", payload: {} } })
    ).toBeNull()
  })
})
