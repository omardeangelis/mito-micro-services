import { describe, expect, it } from "vitest"
import type { TaskStatus } from "../../schemas"
import { taskStatus } from "@mito/db/schema/task"
import {
  type CallOutcome,
  callOutcomes,
  needsConfirmation,
  outcomeEffect,
} from "../outcome"

const today = "2026-11-02"
const tomorrow = "2026-11-03"
const yesterday = "2026-11-01"

describe("outcomeEffect", () => {
  it("Non risponde follows the alert: today keeps it and the state is non risponde", () => {
    expect(
      outcomeEffect("non risponde", "richiamare", { day: today }, today)
    ).toEqual({ state: "non risponde", alert: "keep" })
  })

  it("Non risponde on a future alert leaves the state in richiamare", () => {
    expect(
      outcomeEffect("non risponde", "richiamare", { day: tomorrow }, today)
    ).toEqual({ state: "richiamare", alert: "keep" })
  })
})

describe("outcomeEffect table", () => {
  const alerts = {
    future: { day: tomorrow },
    today: { day: today },
    expired: { day: yesterday },
    none: null,
  }
  const states = [...taskStatus] as TaskStatus[]

  describe.each(states)("from %s", (state) => {
    describe.each(Object.entries(alerts))("with alert %s", (kind, alert) => {
      it("Non risponde", () => {
        expect(outcomeEffect("non risponde", state, alert, today)).toEqual({
          state: kind === "future" ? "richiamare" : "non risponde",
          alert: "keep",
        })
      })

      it("Richiamare replaces the alert", () => {
        expect(outcomeEffect("richiamare", state, alert, today)).toEqual({
          state: "richiamare",
          alert: "replace",
        })
      })

      it("Appuntamento closes the alert", () => {
        expect(outcomeEffect("app.to", state, alert, today)).toEqual({
          state: "app.to",
          alert: "close",
        })
      })

      it("Non interessato closes the alert", () => {
        expect(outcomeEffect("non interessato", state, alert, today)).toEqual({
          state: "non interessato",
          alert: "close",
        })
      })
    })
  })

  it("covers the four outcomes", () => {
    const outcomes: CallOutcome[] = [
      "non risponde",
      "richiamare",
      "app.to",
      "non interessato",
    ]
    expect([...callOutcomes]).toEqual(outcomes)
  })
})

describe("needsConfirmation", () => {
  it("is true only for a future alert", () => {
    expect(needsConfirmation({ day: tomorrow }, today)).toBe(true)
    expect(needsConfirmation({ day: today }, today)).toBe(false)
    expect(needsConfirmation({ day: yesterday }, today)).toBe(false)
    expect(needsConfirmation(null, today)).toBe(false)
  })
})
