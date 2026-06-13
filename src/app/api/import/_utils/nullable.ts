import { type ZodIssue } from "zod"
import { isWaveRow } from "."
import {
  type StandardImportNotNullKeys,
  type WaveNotNullKeys,
  waveNotNullKeys,
  standardImportNotNullKeys,
} from "../_constants"
import { type StandardImportFile, type WaveFile } from "../_types"

const getPraticaNullableError = (
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

export const filterPratica = <T extends StandardImportFile | WaveFile>(
  rawPratica: T[]
) => {
  const practiceToProcess = [] as T[]
  const practiceWithError = [] as [number, T, ZodIssue[]][]
  for (const row of rawPratica) {
    if (isWaveRow(row)) {
      if (
        !waveNotNullKeys.every(
          (key) => row[key] !== null && row[key] !== undefined
        )
      ) {
        practiceWithError.push([
          rawPratica.indexOf(row),
          row,
          waveNotNullKeys
            .filter((key) => !row[key])
            .map((key) => {
              return {
                message: getPraticaNullableError(key),
                keys: [key],
                path: [key],
                code: "custom",
              }
            }),
        ])
      } else {
        practiceToProcess.push(row)
      }
    } else {
      if (
        !standardImportNotNullKeys.every(
          (key) =>
            (row as StandardImportFile)[key] !== null &&
            (row as StandardImportFile)[key] !== undefined
        )
      ) {
        practiceWithError.push([
          rawPratica.indexOf(row),
          row,
          standardImportNotNullKeys
            .filter((key) => !(row as StandardImportFile)[key])
            .map((key) => {
              return {
                message: getPraticaNullableError(key),
                keys: [key],
                path: [key],
                code: "custom",
              }
            }),
        ])
      } else {
        practiceToProcess.push(row)
      }
    }
  }
  return { practiceToProcess, practiceInitialError: practiceWithError }
}
