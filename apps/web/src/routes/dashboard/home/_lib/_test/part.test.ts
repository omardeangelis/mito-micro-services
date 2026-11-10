import { describe, expect, it } from "vitest"
import { partState } from "../part"

describe("partState (D7)", () => {
  it.each([
    ["primo caricamento", false, true, 0, "loading"],
    ["dopo «Riprova», azzerata", false, true, 0, "loading"],
    ["rilettura di una query fallita senza dati", false, true, 5, "error"],
    ["caricamento fallito", true, false, 5, "error"],
    ["rilettura fallita, con i dati", true, false, 5, "error"],
    ["dati", false, false, 0, "data"],
    ["dati dopo un errore", false, false, 5, "data"],
  ] as const)("%s", (_, isError, isPending, errorUpdatedAt, state) => {
    expect(partState({ isError, isPending, errorUpdatedAt })).toBe(state)
  })
})
