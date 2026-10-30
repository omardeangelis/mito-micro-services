import { describe, expect, it } from "vitest"
import { callsKpi, rateKpi } from "../calls"
import { formatKpi } from "../results"

describe("callsKpi (AC2)", () => {
  it("composes «3.725 chiamate · 57% con risposta» with the number printed once", () => {
    const kpi = callsKpi(3_725, 2_123, null)
    expect(`${formatKpi(kpi)} ${kpi.caption}`).toBe(
      "3.725 chiamate · 57% con risposta"
    )
  })

  it("uses the singular for one call", () => {
    const kpi = callsKpi(1, 1, null)
    expect(`${formatKpi(kpi)} ${kpi.caption}`).toBe(
      "1 chiamata · 100% con risposta"
    )
  })

  it("is only the unit without calls", () => {
    const kpi = callsKpi(0, 0, null)
    expect(kpi.caption).toBe("chiamate")
    expect(`${formatKpi(kpi)} ${kpi.caption}`).toBe("0 chiamate")
  })
})

describe("rateKpi variation notes (AC12)", () => {
  it("has no variation and no note when the window has no answers", () => {
    const kpi = rateKpi(0, 0, { appointments: 2, answered: 10 })
    expect(kpi.value).toBeNull()
    expect(kpi.delta).toBeNull()
  })

  it("says the comparison has no data when only its rate can't be computed", () => {
    const kpi = rateKpi(3, 10, { appointments: 0, answered: 0 })
    expect(kpi.delta).toEqual({
      kind: "none",
      note: "Il confronto non ha dati: la variazione non si calcola",
    })
  })

  it("gives points when both rates exist", () => {
    const kpi = rateKpi(3, 10, { appointments: 2, answered: 10 })
    expect(kpi.delta).toEqual({ kind: "points", value: 10 })
  })
})
