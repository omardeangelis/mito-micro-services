// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CustomerAssignmentForbidden, HandoverSameOperator } from "../errors"

// AC10: each error builds as the services build it

describe("errori dei clienti: costruzione", () => {
  it.each([
    { Class: CustomerAssignmentForbidden, tag: "CustomerAssignmentForbidden" },
    { Class: HandoverSameOperator, tag: "HandoverSameOperator" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })
})
