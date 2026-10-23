import { describe, expect, it } from "vitest"
import { planStateChange } from "../transition"

describe("planStateChange", () => {
  it("reopens when an outcome goes back to chiamare", () => {
    expect(
      planStateChange({
        from: "non interessato",
        to: "chiamare",
        openAlertId: null,
        confirmedAlertId: null,
      })
    ).toEqual({ kind: "reopen", resolveAlert: false })
  })
})

type State = (typeof states)[number]
type Expected = "noop" | "reject" | "persist" | "close" | "reopen"

const states = [
  "chiamare",
  "non interessato",
  "app.to",
  "caricato",
  "richiamare",
  "non risponde",
  "erogata",
  "nessuno",
  "followup",
] as const

// Written out by hand from the rules, not computed from the module.
const toCall: State[] = ["chiamare", "followup", "non risponde"]
const outcome: State[] = [
  "app.to",
  "caricato",
  "erogata",
  "non interessato",
  "richiamare",
]

const expectedKind = (from: State, to: State): Expected => {
  if (from === to) return "noop"
  if (to === "followup") return "reject"
  if (from === "followup" && to === "chiamare") return "reject"
  if (from === "non risponde" && to === "chiamare") return "reject"
  if (toCall.includes(from) && outcome.includes(to)) return "close"
  if (outcome.includes(from) && to === "chiamare") return "reopen"
  return "persist"
}

const pairs = states.flatMap((from) => states.map((to) => [from, to] as const))

describe("planStateChange without an open alert", () => {
  it.each(pairs)("%s -> %s", (from, to) => {
    const kind = expectedKind(from, to)
    const plan = planStateChange({
      from,
      to,
      openAlertId: null,
      confirmedAlertId: null,
    })
    if (kind === "noop" || kind === "reject") {
      expect(plan).toEqual({ kind })
    } else {
      expect(plan).toEqual({ kind, resolveAlert: false })
    }
  })
})

describe("planStateChange with an open alert", () => {
  const alertId = 1001

  it.each(pairs)(
    "%s -> %s asks for confirmation when not confirmed",
    (from, to) => {
      const kind = expectedKind(from, to)
      const expectedUnconfirmed =
        kind === "noop" || kind === "reject"
          ? { kind }
          : { kind: "needsAlertConfirmation", alertId }

      expect(
        planStateChange({
          from,
          to,
          openAlertId: alertId,
          confirmedAlertId: null,
        })
      ).toEqual(expectedUnconfirmed)
      expect(
        planStateChange({
          from,
          to,
          openAlertId: alertId,
          confirmedAlertId: 42,
        })
      ).toEqual(expectedUnconfirmed)
    }
  )

  it.each(pairs)("%s -> %s resolves the alert when confirmed", (from, to) => {
    const kind = expectedKind(from, to)
    const plan = planStateChange({
      from,
      to,
      openAlertId: alertId,
      confirmedAlertId: alertId,
    })
    if (kind === "noop" || kind === "reject") {
      expect(plan).toEqual({ kind })
    } else {
      expect(plan).toEqual({ kind, resolveAlert: true })
    }
  })
})

describe("planStateChange with a null from", () => {
  it.each(states)("behaves as nessuno -> %s", (to) => {
    const input = { to, openAlertId: null, confirmedAlertId: null }
    expect(planStateChange({ ...input, from: null })).toEqual(
      planStateChange({ ...input, from: "nessuno" })
    )
  })

  it("is a noop when the target is nessuno, even with an open alert", () => {
    expect(
      planStateChange({
        from: null,
        to: "nessuno",
        openAlertId: 7,
        confirmedAlertId: null,
      })
    ).toEqual({ kind: "noop" })
  })

  it("persists nessuno to chiamare and to an outcome", () => {
    const input = { from: null, openAlertId: null, confirmedAlertId: null }
    expect(planStateChange({ ...input, to: "chiamare" })).toEqual({
      kind: "persist",
      resolveAlert: false,
    })
    expect(planStateChange({ ...input, to: "app.to" })).toEqual({
      kind: "persist",
      resolveAlert: false,
    })
  })
})
