import { type StandardImportType, type WaveImportType } from "../../_types"
import { filterPratica } from "../nullable"
import { describe, it, expect } from "vitest"

export const createStandardTestItem = (type: "valid" | "invalid") => {
  if (type === "invalid") {
    return {
      PRATICA: 0,
      IMPORTO_FINANZIATO: null,
      CLIENTE: 0,
      IMPORTO_NETTO_EROGATO: 0,
      IMPORTO_RATA: 0,
      NUMERO_RATE: 0,
      DATA_LIQUIDAZIONE: 0,
    }
  }
  return {
    PRATICA: 1,
    IMPORTO_FINANZIATO: 0,
    CLIENTE: 1,
    IMPORTO_NETTO_EROGATO: 1,
    IMPORTO_RATA: 1,
    NUMERO_RATE: 1,
    DATA_LIQUIDAZIONE: 1,
  }
}

export const createWaveTestItem = (type: "valid" | "invalid") => {
  if (type === "invalid") {
    return {
      "n° Pratica": 0,
      "Codice NDG": 0,
      "Importo Finanziato": 0,
      "Importo Rata": 0,
      "Importo Richiesto": 0,
      "N° rate pratica": null,
      "Data Erogazione": 0,
      Garante: "no",
    }
  }
  return {
    "n° Pratica": 1,
    "Codice NDG": 1,
    "Importo Finanziato": 1,
    "Importo Rata": 1,
    "Importo Richiesto": 1,
    "N° rate pratica": 1,
    "Data Erogazione": 1,
    Garante: "si",
  }
}

export const createTestItem = (
  type: "valid" | "invalid",
  file: "standard" | "wave"
) => {
  if (file === "standard") {
    return createStandardTestItem(type)
  }
  return createWaveTestItem(type)
}

export const createTestItems = (
  type: "valid" | "invalid",
  file: "standard" | "wave",
  num: number
) => {
  return Array(num)
    .fill(null)
    .map(() => createTestItem(type, file))
}

describe("filterPratica", () => {
  it("20 Pratiche con errore, 20 pratiche con successo", () => {
    const validStandard = createTestItems("valid", "standard", 10)
    const validWave = createTestItems("valid", "wave", 10)
    const invalidStandard = createTestItems("invalid", "standard", 10)
    const invalidWave = createTestItems("invalid", "wave", 10)
    const all = [
      ...validStandard,
      ...validWave,
      ...invalidStandard,
      ...invalidWave,
    ] as (StandardImportType | WaveImportType)[]
    const { practiceInitialError, practiceToProcess } = filterPratica(all)
    expect({
      practiceInitialError: practiceInitialError.length,
      practiceToProcess: practiceToProcess.length,
    }).toEqual({
      practiceInitialError: 20,
      practiceToProcess: 20,
    })
  })
})
