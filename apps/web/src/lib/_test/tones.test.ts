import { describe, expect, it } from "vitest"
import {
  blacklistTone,
  importTone,
  productTone,
  stateTone,
  toneClasses,
  toneDot,
  type Tone,
} from "../tones"

// I toni dei significati, come la tabella dell'appendice B della spec
// design-system-web (AC3)
describe("stateTone", () => {
  it("dà a ogni stato del contatto il suo tono", () => {
    expect(stateTone("richiamare")).toBe("amber")
    expect(stateTone(null)).toBe("neutral")
    expect({
      chiamare: stateTone("chiamare"),
      followup: stateTone("followup"),
      "non risponde": stateTone("non risponde"),
      richiamare: stateTone("richiamare"),
      "app.to": stateTone("app.to"),
      caricato: stateTone("caricato"),
      erogata: stateTone("erogata"),
      "non interessato": stateTone("non interessato"),
      nessuno: stateTone("nessuno"),
    }).toEqual({
      chiamare: "blue",
      followup: "magenta",
      "non risponde": "orange",
      richiamare: "amber",
      "app.to": "teal",
      caricato: "indigo",
      erogata: "green",
      "non interessato": "red",
      nessuno: "neutral",
    })
  })
})

describe("productTone", () => {
  it("dà a ogni tipo di prodotto il suo tono", () => {
    expect(productTone("Personale")).toBe("green")
    expect(productTone("auto")).toBe("blue")
    expect(productTone("Finalizzato")).toBe("amber")
    expect(productTone(undefined)).toBe("neutral")
  })
})

describe("blacklistTone e importTone", () => {
  it("danno il tono della blacklist e dell'import", () => {
    expect(blacklistTone("blacklisted")).toBe("red")
    expect(blacklistTone("review")).toBe("amber")
    expect(blacklistTone("whitelisted")).toBe("green")
    expect(importTone("running")).toBe("neutral")
    expect(importTone("completed")).toBe("green")
    expect(importTone("failed")).toBe("red")
    expect(importTone("interrupted")).toBe("amber")
  })
})

describe("toneClasses e toneDot", () => {
  const tones: Tone[] = [
    "blue",
    "indigo",
    "magenta",
    "orange",
    "amber",
    "teal",
    "green",
    "red",
    "neutral",
  ]

  // Classi intere, che Tailwind trova nei sorgenti
  it.each(tones)("%s ha fondo, bordo, testo e punto del suo token", (tone) => {
    expect(toneClasses[tone].split(" ")).toEqual(
      expect.arrayContaining([
        `bg-tag-${tone}-bg`,
        `border-tag-${tone}-border`,
        `text-tag-${tone}-text`,
      ])
    )
    expect(toneDot[tone]).toBe(`bg-tag-${tone}-dot`)
  })
})
