// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CustomerExists, PracticeExists, PracticeNotFound } from "../errors"

// AC10: each error builds as the services build it

describe("errori delle pratiche: costruzione", () => {
  it.each([
    { Class: PracticeNotFound, tag: "PracticeNotFound" },
    { Class: PracticeExists, tag: "PracticeExists" },
    { Class: CustomerExists, tag: "CustomerExists" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })
})
