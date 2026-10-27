import { describe, expect, it } from "vitest"
import { parseEnv } from "../env"

describe("parseEnv", () => {
  it("accepts staging and no value", () => {
    expect(parseEnv({ VITE_APP_ENV: "staging" })).toEqual({
      VITE_APP_ENV: "staging",
    })
    expect(parseEnv({ MODE: "test" })).toEqual({})
  })

  it("stops on any other value of VITE_APP_ENV", () => {
    expect(() => parseEnv({ VITE_APP_ENV: "prod" })).toThrow()
  })
})
