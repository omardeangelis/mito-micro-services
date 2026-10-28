// @vitest-environment node
import { describe, expect, it } from "vitest"
import { OidcUnauthorized } from "../oidc"

// AC10: the error builds as `verifyIdToken` builds it

describe("errori dell'OIDC: costruzione", () => {
  it("OidcUnauthorized porta il motivo", () => {
    const error = new OidcUnauthorized({
      reason: "not the caller's service account",
    })
    expect(error).toBeInstanceOf(OidcUnauthorized)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("OidcUnauthorized")
    expect(error.reason).toBe("not the caller's service account")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "OidcUnauthorized",
      reason: "not the caller's service account",
    })
  })
})
