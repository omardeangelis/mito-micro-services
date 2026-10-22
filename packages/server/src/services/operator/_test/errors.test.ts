import { describe, expect, it } from "vitest"
import { readContactError } from "@mito/domain/contact/errors"
import {
  CannotDeactivateSelf,
  LastAdmin,
  NotAnOperator,
  OperatorDisabled,
  OperatorIsAdmin,
  operatorErrorToTrpc,
} from "../errors"
import { OperatorNotFound } from "../../contact/errors"
import { HandoverSameOperator } from "../../customer/errors"

// The errors of the operator services reach the interface with a code it
// reads in both shapes of an error of `@/trpc/server` (CLAUDE.md)

describe("operatorErrorToTrpc", () => {
  it("readContactError legge LAST_ADMIN dalla forma HTTP dell'errore", () => {
    const error = operatorErrorToTrpc(new LastAdmin())

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Deve restare almeno un admin",
    })
    // Over HTTP the errorFormatter copies the cause into data.contactError
    const overHttp = { data: { contactError: error.cause } }
    expect(readContactError(overHttp)).toEqual({
      code: "LAST_ADMIN",
      payload: {},
    })
  })
})

describe("operatorErrorToTrpc, one TRPCError per operator error", () => {
  it("NotAnOperator è BAD_REQUEST senza messaggio e senza cause", () => {
    const error = operatorErrorToTrpc(new NotAnOperator())

    expect({
      code: error.code,
      message: error.message,
      cause: error.cause,
    }).toStrictEqual({
      code: "BAD_REQUEST",
      message: "BAD_REQUEST",
      cause: undefined,
    })
  })

  it("OperatorDisabled è UNAUTHORIZED senza messaggio personalizzato", () => {
    const error = operatorErrorToTrpc(new OperatorDisabled())

    expect(error.code).toBe("UNAUTHORIZED")
    // No message is passed: tRPC takes the empty message of the cause
    expect(error.message).toBe("")
    const overHttp = { data: { contactError: error.cause } }
    expect(readContactError(overHttp)).toEqual({
      code: "OPERATOR_DISABLED",
      payload: {},
    })
  })

  it("OperatorIsAdmin è BAD_REQUEST con il messaggio di declassamento", () => {
    const error = operatorErrorToTrpc(new OperatorIsAdmin())

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Declassa l'admin a operatore prima di disattivarlo",
    })
    const overHttp = { data: { contactError: error.cause } }
    expect(readContactError(overHttp)).toEqual({
      code: "OPERATOR_IS_ADMIN",
      payload: {},
    })
  })

  it("CannotDeactivateSelf è BAD_REQUEST con il messaggio di autodisattivazione", () => {
    const error = operatorErrorToTrpc(new CannotDeactivateSelf())

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Non puoi disattivare te stesso",
    })
    const overHttp = { data: { contactError: error.cause } }
    expect(readContactError(overHttp)).toEqual({
      code: "CANNOT_DEACTIVATE_SELF",
      payload: {},
    })
  })

  it("LastAdmin legge LAST_ADMIN anche dalla forma in-process dell'errore", () => {
    const error = operatorErrorToTrpc(new LastAdmin())

    // In-process a Server Component gets a TRPCClientError whose cause is the TRPCError
    expect(readContactError({ cause: error })).toEqual({
      code: "LAST_ADMIN",
      payload: {},
    })
  })

  it("OperatorNotFound mappa come contactErrorToTrpc", () => {
    const error = operatorErrorToTrpc(new OperatorNotFound())

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Operatore non trovato",
    })
    expect(readContactError({ data: { contactError: error.cause } })).toEqual({
      code: "OPERATOR_NOT_FOUND",
      payload: {},
    })
  })

  it("HandoverSameOperator mappa come customerErrorToTrpc", () => {
    const error = operatorErrorToTrpc(new HandoverSameOperator())

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Il cliente è già di questo operatore",
    })
    expect(readContactError({ data: { contactError: error.cause } })).toEqual({
      code: "HANDOVER_SAME_OPERATOR",
      payload: {},
    })
  })
})
