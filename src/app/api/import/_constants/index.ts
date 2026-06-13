import { type WaveFileKeys, type StandardImportFileKeys } from "../_types"

export const standardImportFileKeys: StandardImportFileKeys[] = [
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
]

export const waveFileKeys: WaveFileKeys[] = [
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
]

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
