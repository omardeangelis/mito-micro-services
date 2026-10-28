// @vitest-environment node
import { describe, expect, it } from "vitest"
import { AlertsFailed, AlertsLeft, CronStepFailed } from "../jobs"

// AC10: each error builds from the values the jobs pass

describe("errori dei job dei cron: costruzione", () => {
  it("CronStepFailed porta il passo e la cause, la stessa istanza", () => {
    const cause = new Error("updatePractices threw")
    const error = new CronStepFailed({ step: "updatePractices", cause })
    expect(error).toBeInstanceOf(CronStepFailed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("CronStepFailed")
    expect(error.step).toBe("updatePractices")
    expect(error.cause).toBe(cause)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "CronStepFailed",
      step: "updatePractices",
    })
  })

  it("CronStepFailed con una cause che non è un Error, o undefined", () => {
    const cause = { _tag: "DbError", code: "57014" }
    expect(
      new CronStepFailed({ step: "cleanupTaskEventLog", cause }).cause
    ).toBe(cause)
    expect(
      new CronStepFailed({ step: "updateCustomerAge", cause: undefined }).cause
    ).toBeUndefined()
  })

  it("AlertsFailed porta gli alert falliti", () => {
    const error = new AlertsFailed({ failed: 2 })
    expect(error).toBeInstanceOf(AlertsFailed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("AlertsFailed")
    expect(error.failed).toBe(2)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "AlertsFailed", failed: 2 })
  })

  it("AlertsLeft porta le chiamate fatte", () => {
    const error = new AlertsLeft({ calls: 20 })
    expect(error).toBeInstanceOf(AlertsLeft)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("AlertsLeft")
    expect(error.calls).toBe(20)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "AlertsLeft", calls: 20 })
  })
})
