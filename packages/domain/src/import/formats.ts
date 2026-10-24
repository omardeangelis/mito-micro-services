// The columns of the two layouts an import file can have. Pure: no React,
// Next.js or server code, so the UI and the backend share it.

export const standardColumns = [
  "AGENTE",
  "CAP_CLIENTE",
  "CLIENTE",
  "CODICE_FISCALE_CLI",
  "CONVENZIONATO",
  // "DATA",
  "DATA_CARICAMENTO",
  "DATA_LIQUIDAZIONE",
  "DES_AGENTE",
  "DES_CLIENTE",
  "DES_CONVENZIONATO",
  "DES_PUNTO_VENDITA",
  "DES_SUBAGENTE",
  // "ESITO CHIAMATE",
  "IMPORTO_FINANZIATO",
  "IMPORTO_NETTO_EROGATO",
  "IMPORTO_RATA",
  "INDIRIZZO_CLI",
  "LOCALITA_CLI",
  "MOD_PAGAMENTO",
  // "NOTE",
  "NUMERO_RATE",
  // "OPERATORE",
  "PRATICA",
  "PRODOTTO",
  "PROVINCIA_CLI",
  "PUNTO_VENDITA",
  "REGIONE",
  "SITUAZIONE",
  // "STATO",
  "SUBAGENTE",
  "TABELLA_FINANZ",
] as const
export type StandardColumn = (typeof standardColumns)[number]

export const waveColumns = [
  "Ambito lavorativo (ex 'Dip Pub')",
  "CAP Residenza",
  "Call Center",
  "Canale Assegnato",
  "Canale di Contatto",
  "Canale di provenienza",
  "Carta di Credito",
  "Cliente Coobbligato",
  "Codice Fiscale",
  "Codice Iniziativa",
  "Codice NDG",
  "Codice Prodotto Pratica",
  "Cognome",
  "Comune di residenza",
  "Contattato con DEM/SMS/DM",
  "Contocarta",
  "Data Erogazione",
  "Data Estinzione",
  "Data di Nascita",
  "Datore di Lavoro",
  "Debito Residuo",
  "Descrizione Iniziativa",
  "Descrizione PdV",
  "Descrizione Prodotto Pratica",
  "Descrizione Stato Pratica",
  "Email",
  "Età",
  "Garante",
  "Importo Finanziato",
  "Importo Rata",
  "Importo Richiesto",
  "Indirizzo di residenza",
  "Modalità di Pagamento",
  "N_Transazioni_Accredito",
  "N_Transazioni_Addebito",
  "Nome",
  "N° pratiche Operative",
  "N° rate Pagate",
  "N° rate Residue",
  "N° rate pratica",
  "Occupazione",
  "Provincia di residenza",
  "Reddito",
  "Region",
  'Target (ex "tipo offerta")',
  "Tasso Pratica",
  "Telefono Definitivo",
  "Tipo Contratto",
  "data_scadenza",
  "n° Pratica",
] as const
export type WaveColumn = (typeof waveColumns)[number]

export type ImportFormat = "wave" | "standard"

/** The layout of a file, or why its first row does not match one. */
export type DetectedFormat =
  | { format: "wave" }
  | { format: "standard" }
  | { error: "emptyHeaders" }
  | {
      error: "missingColumns"
      /** The layout the file has most columns of; a tie is "wave". */
      closest: ImportFormat
      /** The columns of `closest` the file lacks, in the order of the list. */
      missing: (WaveColumn | StandardColumn)[]
    }

/** Reads the layout from the first row: names are trimmed, extra columns are ignored. */
export function detectFormat(headers: readonly unknown[]): DetectedFormat {
  const names = new Set<string>()
  for (const header of headers) {
    if (header === null || header === undefined) continue
    const name = String(header).trim()
    if (name !== "") names.add(name)
  }
  if (names.size === 0) return { error: "emptyHeaders" }

  if (waveColumns.every((column) => names.has(column))) {
    return { format: "wave" }
  }
  if (standardColumns.every((column) => names.has(column))) {
    return { format: "standard" }
  }

  const waveFound = waveColumns.filter((column) => names.has(column)).length
  const standardFound = standardColumns.filter((column) =>
    names.has(column)
  ).length
  const closest: ImportFormat = standardFound > waveFound ? "standard" : "wave"
  const expected: readonly (WaveColumn | StandardColumn)[] =
    closest === "wave" ? waveColumns : standardColumns
  return {
    error: "missingColumns",
    closest,
    missing: expected.filter((column) => !names.has(column)),
  }
}
