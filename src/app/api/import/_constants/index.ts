import { type WaveFileKeys, type StandardImportFileKeys } from "../_types"
import { standardColumns, waveColumns } from "@mito/domain/import/formats"

export const standardImportFileKeys: StandardImportFileKeys[] = [
  ...standardColumns,
]

export const waveFileKeys: WaveFileKeys[] = [...waveColumns]

export const waveNotNullKeys = [
  "n° Pratica",
  "Codice NDG",
  "Importo Finanziato",
  "Importo Rata",
  "Importo Richiesto",
  "N° rate pratica",
  "Data Erogazione",
] as const
export type WaveNotNullKeys = (typeof waveNotNullKeys)[number]

export const standardImportNotNullKeys = [
  "PRATICA",
  "IMPORTO_FINANZIATO",
  "CLIENTE",
  "IMPORTO_NETTO_EROGATO",
  "IMPORTO_RATA",
  "NUMERO_RATE",
  "DATA_LIQUIDAZIONE",
] as const

export type StandardImportNotNullKeys =
  (typeof standardImportNotNullKeys)[number]

export const getPraticaNullableError = (
  key: StandardImportNotNullKeys | WaveNotNullKeys
) => {
  switch (key) {
    case "PRATICA":
    case "n° Pratica":
      return "Manca ID Pratica"
    case "IMPORTO_FINANZIATO":
    case "Importo Finanziato":
      return "Manca Importo Finanziato"
    case "CLIENTE":
    case "Codice NDG":
      return "Manca Codice Identificativo Cliente o Codice NDG"
    case "IMPORTO_NETTO_EROGATO":
    case "Importo Richiesto":
      return "Manca Importo Richiesto"
    case "IMPORTO_RATA":
    case "Importo Rata":
      return "Manca Importo Rata"
    case "NUMERO_RATE":
    case "N° rate pratica":
      return "Manca Numero Rate"
    case "DATA_LIQUIDAZIONE":
    case "Data Erogazione":
      return "Manca Data Erogazione o Data Liquidazione"
  }
}
