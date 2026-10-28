import { describe, expect, it } from "vitest"
import { MAX_CHAT_LIMIT } from "@mito/domain/constants/chat"
import { chatLimitOf, parseChatLimit } from "../chatLimit"

describe("parseChatLimit: quanti messaggi della chat mostra il dettaglio (AC57)", () => {
  it.each([
    ["5", 5],
    ["10", 10],
    ["250", 250],
    [String(MAX_CHAT_LIMIT), MAX_CHAT_LIMIT],
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
    ["oltre il tetto", String(MAX_CHAT_LIMIT + 1)],
    ["enorme", "1000000000000000000000"],
    ["ripetuto", ["5", "10"]],
  ])(
    "ignora un valore %s: la chat parte dal numero di default",
    (_name, value) => {
      expect(parseChatLimit(value)).toBeUndefined()
    }
  )
})

describe("chatLimitOf: il limit dei parametri dell'indirizzo", () => {
  it.each([
    ["?limit=20", 20],
    ["?tab=note&limit=10", 10],
    ["", undefined],
    ["?limit=abc", undefined],
    ["?limit=5&limit=10", undefined],
  ])("legge '%s'", (search, expected) => {
    expect(chatLimitOf(new URLSearchParams(search))).toBe(expected)
  })
})
