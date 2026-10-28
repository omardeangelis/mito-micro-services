// @vitest-environment node
import { describe, expect, it } from "vitest"
import { SystemOperatorMissing } from "../processDueAlerts"

// AC10: the error builds as `processDueAlerts` builds it

describe("errori del cron degli alert: costruzione", () => {
  it("SystemOperatorMissing si costruisce senza campi", () => {
    const error = new SystemOperatorMissing()
    expect(error).toBeInstanceOf(SystemOperatorMissing)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("SystemOperatorMissing")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "SystemOperatorMissing" })
  })
})
