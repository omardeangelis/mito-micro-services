import { describe, expect, it } from "vitest"
import { parseChatLimit } from "../chatLimit"

describe("parseChatLimit: quanti messaggi della chat mostra il dettaglio (AC57)", () => {
  it.each([
    ["5", 5],
    ["10", 10],
    ["250", 250],
    ["10000", 10_000],
  ])("legge %s", (value, expected) => {
    expect(parseChatLimit(value)).toBe(expected)
  })

  it.each([
    ["assente", undefined],
    ["vuoto", ""],
    ["zero", "0"],
    ["negativo", "-3"],
    ["decimale", "1.5"],
    ["testo", "abc"],
    ["notazione scientifica", "1e2"],
    ["esadecimale", "0x10"],
    ["con spazi", " 5 "],
    ["con zeri davanti", "007"],
    ["oltre il tetto", "10001"],
    ["enorme", "1000000000000000000000"],
    ["ripetuto", ["5", "10"]],
  ])(
    "ignora un valore %s: la chat parte dal numero di default",
    (_name, value) => {
      expect(parseChatLimit(value)).toBeUndefined()
    }
  )
})
