import * as XLSX from "xlsx"
import { standardColumns, waveColumns } from "@mito/domain/import/formats"

// Import files built in the tests, as Excel saves them

type Value = string | number | null | XLSX.CellObject
export type Row = Record<string, Value>

/** A date cell: a serial number with a date format, "m/d/yy" in the CSV. */
export const dateCell = (year: number, month: number, day: number) =>
  ({
    t: "n",
    v: (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000,
    z: "m/d/yy",
  }) satisfies XLSX.CellObject

export const numberCell = (value: number, format: string) =>
  ({ t: "n", v: value, z: format }) satisfies XLSX.CellObject

/** The bytes of an .xlsx file with the headers and the rows. */
export const workbook = (headers: readonly string[], rows: Row[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? null)),
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Foglio1")
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

export const waveFile = (...rows: Row[]) => workbook(waveColumns, rows)
export const standardFile = (...rows: Row[]) => workbook(standardColumns, rows)

export const waveRow = (row: Row = {}): Row => ({
  "n° Pratica": "900001",
  "Codice NDG": "100001",
  "Codice Fiscale": "RSSMRA80A01H501U",
  Nome: "MARIO",
  Cognome: "ROSSI",
  "Data di Nascita": dateCell(1980, 1, 1),
  Età: 45,
  "CAP Residenza": "00184",
  "Indirizzo di residenza": "VIA ROMA 1",
  "Comune di residenza": "ROMA",
  "Provincia di residenza": "RM",
  "Telefono Definitivo": 3331234567,
  Email: "Mario.Rossi@Example.COM",
  "Descrizione PdV": "Roma - Eur",
  Region: "LAZIO",
  "Data Erogazione": dateCell(2024, 1, 15),
  "Descrizione Stato Pratica": "40 Erogata",
  "Importo Richiesto": 2000,
  "Importo Finanziato": 2200,
  "N° rate pratica": 24,
  "Importo Rata": 100,
  "Tasso Pratica": 7.5,
  "Modalità di Pagamento": "SDD",
  "Codice Prodotto Pratica": 1,
  Garante: "NO",
  "Cliente Coobbligato": "NO",
  Reddito: 1500,
  Occupazione: "IMPIEGATO",
  "Ambito lavorativo (ex 'Dip Pub')": "PRIVATO",
  "Tipo Contratto": "TEMPO INDETERMINATO",
  ...row,
})

export const standardRow = (row: Row = {}): Row => ({
  PRATICA: "000123",
  REGIONE: "LAZIO",
  PUNTO_VENDITA: 10,
  DES_PUNTO_VENDITA: "ROMA EUR",
  CONVENZIONATO: 20,
  DES_CONVENZIONATO: "CONCESSIONARIA SRL",
  SUBAGENTE: 30,
  DES_SUBAGENTE: "AGENZIA - Roma Eur",
  AGENTE: 40,
  DES_AGENTE: "AGENTE SPA",
  SITUAZIONE: "LIQUIDATA",
  CLIENTE: "5001",
  DES_CLIENTE: "ROSSI MARIO",
  CODICE_FISCALE_CLI: "RSSMRA80A01H501U",
  PRODOTTO: 24,
  TABELLA_FINANZ: "T1",
  NUMERO_RATE: 24,
  IMPORTO_RATA: 100,
  IMPORTO_FINANZIATO: 2200,
  IMPORTO_NETTO_EROGATO: 2000,
  DATA_CARICAMENTO: dateCell(2024, 1, 10),
  DATA_LIQUIDAZIONE: dateCell(2024, 1, 15),
  MOD_PAGAMENTO: "SDD",
  INDIRIZZO_CLI: "VIA ROMA 1",
  CAP_CLIENTE: "00184",
  LOCALITA_CLI: "ROMA",
  PROVINCIA_CLI: "RM",
  ...row,
})
