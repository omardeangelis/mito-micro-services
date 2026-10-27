// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CustomerMissing, DbError } from "../db"

// AC10: each error builds from the values `query` and `lockCustomer` pass

describe("errori del database: costruzione", () => {
  it("DbError porta cause, message e il codice SQLSTATE", () => {
    const cause = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    })
    const error = new DbError({
      cause,
      message: "duplicate key value",
      code: "23505",
    })
    expect(error).toBeInstanceOf(DbError)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("DbError")
    expect(error.cause).toBe(cause)
    expect(error.message).toBe("duplicate key value")
    expect(error.code).toBe("23505")
    expect({ ...error }).toStrictEqual({ _tag: "DbError", code: "23505" })
  })

  it("DbError senza codice e con una cause che non è un Error", () => {
    const cause = { reason: "socket closed" }
    const error = new DbError({
      cause,
      message: "[object Object]",
      code: undefined,
    })
    expect(error.cause).toBe(cause)
    expect(error.message).toBe("[object Object]")
    expect(error.code).toBeUndefined()
    expect({ ...error }).toStrictEqual({ _tag: "DbError", code: undefined })
  })

  it("DbError con cause undefined", () => {
    const error = new DbError({
      cause: undefined,
      message: "undefined",
      code: undefined,
    })
    expect(error.cause).toBeUndefined()
    expect(error.message).toBe("undefined")
    expect({ ...error }).toStrictEqual({
      _tag: "DbError",
      cause: undefined,
      code: undefined,
    })
  })

  it("CustomerMissing porta il cliente, o null", () => {
    const error = new CustomerMissing({ customerId: "inesistente" })
    expect(error).toBeInstanceOf(CustomerMissing)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("CustomerMissing")
    expect(error.customerId).toBe("inesistente")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "CustomerMissing",
      customerId: "inesistente",
    })

    expect(new CustomerMissing({ customerId: null }).customerId).toBeNull()
    expect(new CustomerMissing({ customerId: "" }).customerId).toBe("")
  })
})
