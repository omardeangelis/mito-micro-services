// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  EmailNotAllowed,
  EmailOtherCase,
  EmailTaken,
  UserDisabled,
} from "../login"

// AC10: each error builds as the login rules build it

describe("errori del login: costruzione", () => {
  it.each([
    { Class: UserDisabled, tag: "UserDisabled" },
    { Class: EmailNotAllowed, tag: "EmailNotAllowed" },
    { Class: EmailOtherCase, tag: "EmailOtherCase" },
    { Class: EmailTaken, tag: "EmailTaken" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })
})
