import { describe, expect, it } from "vitest"
import type { TaskCategory, TaskStatus } from "@/lib/types/schemas"
import { taskStatus } from "@/server/db/schema/task"
import {
  allStates,
  canSetCallback,
  selectableStates,
  stateCategory,
} from "../status"

describe("stateCategory", () => {
  const expected: Record<TaskStatus, TaskCategory> = {
    chiamare: "open",
    followup: "open",
    "app.to": "close",
    caricato: "close",
    erogata: "close",
    "non interessato": "close",
    richiamare: "close",
    nessuno: "idle",
  }

  it.each(Object.entries(expected))("%s is %s", (state, category) => {
    expect(stateCategory(state as TaskStatus)).toBe(category)
  })

  it("treats a null state as nessuno", () => {
    expect(stateCategory(null)).toBe("idle")
  })
})

describe("allStates", () => {
  it("lists the states in the order of the taskStatus enum", () => {
    expect([...allStates]).toEqual([...taskStatus])
  })
})

describe("selectableStates", () => {
  it("from followup offers every state but followup, chiamare and itself", () => {
    expect(selectableStates("followup")).toEqual([
      "non interessato",
      "app.to",
      "caricato",
      "richiamare",
      "erogata",
      "nessuno",
    ])
  })

  it("from chiamare offers every state but followup and chiamare", () => {
    expect(selectableStates("chiamare")).toEqual([
      "non interessato",
      "app.to",
      "caricato",
      "richiamare",
      "erogata",
      "nessuno",
    ])
  })

  it("from an outcome offers chiamare and the other outcomes, never followup", () => {
    expect(selectableStates("app.to")).toEqual([
      "chiamare",
      "non interessato",
      "caricato",
      "richiamare",
      "erogata",
      "nessuno",
    ])
  })

  it("from nessuno offers every state but followup and nessuno", () => {
    expect(selectableStates("nessuno")).toEqual([
      "chiamare",
      "non interessato",
      "app.to",
      "caricato",
      "richiamare",
      "erogata",
    ])
  })

  it("from null behaves as nessuno", () => {
    expect(selectableStates(null)).toEqual(selectableStates("nessuno"))
  })
})

describe("canSetCallback", () => {
  it.each([
    ["app.to", true],
    ["caricato", true],
    ["erogata", true],
    ["non interessato", true],
    ["richiamare", true],
    ["nessuno", true],
    ["chiamare", false],
    ["followup", false],
  ] as const)("%s -> %s", (state, expected) => {
    expect(canSetCallback(state)).toBe(expected)
  })

  it("is true for a null state", () => {
    expect(canSetCallback(null)).toBe(true)
  })
})
