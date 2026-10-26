import { describe, expect, it } from "vitest"
import { detectFormat, standardColumns, waveColumns } from "../formats"

describe("detectFormat", () => {
  it("riconosce il tracciato Wave completo", () => {
    expect(detectFormat([...waveColumns])).toEqual({ format: "wave" })
  })

  it("riconosce il tracciato Standard completo", () => {
    expect(detectFormat([...standardColumns])).toEqual({ format: "standard" })
  })

  it("segnala la sola colonna Codice NDG mancante nel Wave", () => {
    const headers = waveColumns.filter((column) => column !== "Codice NDG")

    expect(detectFormat(headers)).toEqual({
      error: "missingColumns",
      closest: "wave",
      missing: ["Codice NDG"],
    })
  })

  it("elenca Codice NDG e Data Erogazione mancanti nell'ordine della lista", () => {
    const headers = waveColumns.filter(
      (column) => column !== "Codice NDG" && column !== "Data Erogazione"
    )

    expect(detectFormat(headers)).toEqual({
      error: "missingColumns",
      closest: "wave",
      missing: ["Codice NDG", "Data Erogazione"],
    })
  })

  it("con una colonna mancante nello Standard, il formato più vicino è lo standard", () => {
    const headers = standardColumns.filter((column) => column !== "PRATICA")

    expect(detectFormat(headers)).toEqual({
      error: "missingColumns",
      closest: "standard",
      missing: ["PRATICA"],
    })
  })

  it("a pari colonne in comune il formato più vicino è il Wave", () => {
    expect(detectFormat(["Codice NDG", "PRATICA"])).toMatchObject({
      error: "missingColumns",
      closest: "wave",
    })
  })

  it.each([
    "PRATICA",
    "IMPORTO_FINANZIATO",
    "CLIENTE",
    "IMPORTO_NETTO_EROGATO",
    "IMPORTO_RATA",
    "NUMERO_RATE",
    "DATA_LIQUIDAZIONE",
  ])("un file Standard senza la colonna %s è rifiutato", (missing) => {
    const headers = standardColumns.filter((column) => column !== missing)

    expect(detectFormat(headers)).toEqual({
      error: "missingColumns",
      closest: "standard",
      missing: [missing],
    })
  })

  it.each([
    "n° Pratica",
    "Codice NDG",
    "Importo Finanziato",
    "Importo Rata",
    "Importo Richiesto",
    "N° rate pratica",
    "Data Erogazione",
  ])("un file Wave senza la colonna %s è rifiutato", (missing) => {
    const headers = waveColumns.filter((column) => column !== missing)

    expect(detectFormat(headers)).toEqual({
      error: "missingColumns",
      closest: "wave",
      missing: [missing],
    })
  })

  it("una prima riga senza intestazioni non è un tracciato", () => {
    expect(detectFormat([])).toEqual({ error: "emptyHeaders" })
    expect(detectFormat(["", null])).toEqual({ error: "emptyHeaders" })
  })

  it("ignora le colonne in più e gli spazi intorno ai nomi", () => {
    const headers = [
      ...waveColumns.map((column) => ` ${column} `),
      "Colonna in più",
      null,
      undefined,
    ]

    expect(detectFormat(headers)).toEqual({ format: "wave" })
  })
})
