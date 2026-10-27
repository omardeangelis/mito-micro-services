// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  CannotDeactivateSelf,
  LastAdmin,
  NotAnOperator,
  OperatorDisabled,
  OperatorIsAdmin,
} from "../errors"

// AC10: each error builds as the services build it

describe("errori degli operatori: costruzione", () => {
  it.each([
    { Class: NotAnOperator, tag: "NotAnOperator" },
    { Class: OperatorDisabled, tag: "OperatorDisabled" },
    { Class: OperatorIsAdmin, tag: "OperatorIsAdmin" },
    { Class: CannotDeactivateSelf, tag: "CannotDeactivateSelf" },
    { Class: LastAdmin, tag: "LastAdmin" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })
})
