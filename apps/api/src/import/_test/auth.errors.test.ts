// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ImportNotConfigured } from "../auth"

// AC10: the error builds as `ImportAuth` builds it

describe("errori dell'autenticazione dell'import: costruzione", () => {
  it("ImportNotConfigured si costruisce senza campi", () => {
    const error = new ImportNotConfigured()
    expect(error).toBeInstanceOf(ImportNotConfigured)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportNotConfigured")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "ImportNotConfigured" })
  })
})
