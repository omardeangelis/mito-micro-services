// @vitest-environment node
import { describe, expect, it } from "vitest"
import { SessionReadFailed } from "../session"

// AC10: the error builds from whatever better-auth rejected with

describe("errori della sessione: costruzione", () => {
  it("SessionReadFailed porta la cause, la stessa istanza", () => {
    const cause = new Error("session table unreachable")
    const error = new SessionReadFailed({ cause })
    expect(error).toBeInstanceOf(SessionReadFailed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("SessionReadFailed")
    expect(error.cause).toBe(cause)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "SessionReadFailed" })
  })

  it("SessionReadFailed con una cause che non è un Error, o undefined", () => {
    const cause = { status: 500 }
    expect(new SessionReadFailed({ cause }).cause).toBe(cause)
    expect(new SessionReadFailed({ cause: undefined }).cause).toBeUndefined()
  })
})
