// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CronNotConfigured, CronUnauthorized } from "../auth"

// AC10: each error builds as `CronAuth` builds it

describe("errori dell'autenticazione dei cron: costruzione", () => {
  it("CronUnauthorized porta il motivo", () => {
    const error = new CronUnauthorized({ reason: "no bearer token" })
    expect(error).toBeInstanceOf(CronUnauthorized)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("CronUnauthorized")
    expect(error.reason).toBe("no bearer token")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "CronUnauthorized",
      reason: "no bearer token",
    })
  })

  it("CronNotConfigured si costruisce senza campi", () => {
    const error = new CronNotConfigured()
    expect(error).toBeInstanceOf(CronNotConfigured)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("CronNotConfigured")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "CronNotConfigured" })
  })
})
