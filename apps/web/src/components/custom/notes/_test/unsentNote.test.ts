import { beforeEach, describe, expect, it } from "vitest"
import { clearUnsentNotes } from "../unsentNote"

beforeEach(() => {
  window.sessionStorage.clear()
})

describe("clearUnsentNotes", () => {
  it("cancella le bozze delle note di ogni cliente e niente altro", () => {
    window.sessionStorage.setItem(
      "mito:nota-non-inviata:c-1",
      JSON.stringify({ operatorId: 11, text: "Uno" })
    )
    window.sessionStorage.setItem(
      "mito:nota-non-inviata:c-2",
      JSON.stringify({ operatorId: 11, text: "Due" })
    )
    window.sessionStorage.setItem("altro", "resta")

    clearUnsentNotes()

    expect(
      window.sessionStorage.getItem("mito:nota-non-inviata:c-1")
    ).toBeNull()
    expect(
      window.sessionStorage.getItem("mito:nota-non-inviata:c-2")
    ).toBeNull()
    expect(window.sessionStorage.getItem("altro")).toBe("resta")
  })
})
