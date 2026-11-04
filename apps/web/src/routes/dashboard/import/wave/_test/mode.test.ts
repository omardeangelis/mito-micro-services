import { describe, expect, it } from "vitest"
import { waveView } from "@/test/import"
import { initialMode, screenKey } from "../_lib/mode"

const withDeadline = waveView({ deadline: "2026-12-03" })
const withoutDeadline = waveView({ deadline: null, status: "unconfirmed" })

describe("La modalità della pagina all'apertura (AC2, AC3, D9)", () => {
  it("senza scadenza: il flusso dopo l'import al primo passo", () => {
    expect(initialMode(withoutDeadline, null)).toEqual({
      kind: "afterImport",
      at: 0,
    })
  })

  it("con la scadenza: la panoramica", () => {
    expect(initialMode(withDeadline, null)).toEqual({ kind: "overview" })
  })

  it("`?per` con la scadenza: «Assegna i restanti» per quella persona", () => {
    expect(initialMode(withDeadline, "7")).toEqual({
      kind: "assignRest",
      per: 7,
    })
  })

  it("`?per` senza scadenza: il flusso al primo passo, con la persona", () => {
    expect(initialMode(withoutDeadline, "7")).toEqual({
      kind: "afterImport",
      at: 0,
      per: 7,
    })
  })

  it("un `per` che non è nel team, o non è un numero, si ignora", () => {
    expect(initialMode(withDeadline, "99")).toEqual({ kind: "overview" })
    expect(initialMode(withDeadline, "abc")).toEqual({ kind: "overview" })
    expect(initialMode(withoutDeadline, "99")).toEqual({
      kind: "afterImport",
      at: 0,
    })
  })

  it("ogni passo e ogni schermata ha la sua chiave, per il fuoco (AC31)", () => {
    const keys = [
      screenKey({ kind: "afterImport", at: 0 }),
      screenKey({ kind: "afterImport", at: 1 }),
      screenKey({ kind: "overview" }),
      screenKey({ kind: "assignRest" }),
      screenKey({ kind: "reassign", at: 0, from: [7] }),
      screenKey({ kind: "reassign", at: 1, from: [7] }),
      screenKey({
        kind: "done",
        screen: { title: "Fatto", text: "", actions: null },
      }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})
