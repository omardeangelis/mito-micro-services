import { describe, expect, it } from "vitest"
import type { TaskStatus } from "../../schemas"
import {
  callableStates,
  contactStates,
  doneStates,
  queueStates,
  removeCallbackTargets,
  selectorTargets,
  stateLabel,
} from "../status"

describe("stateLabel", () => {
  it.each([
    ["chiamare", "Da chiamare"],
    ["non risponde", "Non risponde"],
    ["richiamare", "Richiamo"],
    ["app.to", "Appuntamento"],
    ["caricato", "Pratica caricata"],
    ["non interessato", "Non interessato"],
  ] as const)("%s is %s", (state, label) => {
    expect(stateLabel(state)).toBe(label)
  })

  it("shows the day of the alert on Richiamo", () => {
    expect(stateLabel("richiamare", "2026-11-03")).toBe("Richiamo · 03/11")
  })

  it("gives legacy values the label of their new state (AC30)", () => {
    expect(stateLabel("followup")).toBe("Da chiamare")
    expect(stateLabel("nessuno")).toBe("Da chiamare")
    expect(stateLabel(null)).toBe("Da chiamare")
    expect(stateLabel("erogata")).toBe("Pratica caricata")
  })
})

describe("state groups", () => {
  it("splits the six states into queue and done (AC6)", () => {
    expect([...queueStates, ...doneStates].sort()).toEqual(
      [...contactStates].sort()
    )
    expect([...queueStates]).toEqual(["chiamare", "non risponde"])
  })

  it("lets a call on Da chiamare, Non risponde and Richiamo (AC12)", () => {
    expect([...callableStates]).toEqual([
      "chiamare",
      "non risponde",
      "richiamare",
    ])
  })
})

describe("selectorTargets (AC17)", () => {
  it.each([
    ["chiamare", ["caricato"]],
    ["non risponde", ["caricato"]],
    ["richiamare", ["caricato"]],
    ["followup", ["caricato"]],
    ["nessuno", ["caricato"]],
    ["app.to", ["chiamare", "caricato"]],
    ["non interessato", ["chiamare", "caricato"]],
    ["caricato", ["chiamare"]],
    ["erogata", ["chiamare"]],
  ] as [TaskStatus, string[]][])("from %s offers %j", (state, targets) => {
    expect(selectorTargets(state)).toEqual(targets)
  })
})

describe("removeCallbackTargets (AC22)", () => {
  it("never offers Richiamo", () => {
    expect([...removeCallbackTargets]).toEqual([
      "chiamare",
      "non risponde",
      "app.to",
      "caricato",
      "non interessato",
    ])
  })
})
