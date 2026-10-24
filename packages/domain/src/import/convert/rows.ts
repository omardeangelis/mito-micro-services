// The rows of an import file after papaparse, as `processFile` types them
// today. The values papaparse gives may differ from these types (a text
// column is a number when the cell is); the conversion keeps today's code.

type Nullable<T> = { [K in keyof T]: T[K] | null }

export interface StandardImportType {
  AGENTE: number
  CAP_CLIENTE: string
  CLIENTE: number
  CODICE_FISCALE_CLI: string
  CONVENZIONATO: number
  DATA: null
  DATA_CARICAMENTO: string
  DATA_LIQUIDAZIONE: string
  DES_AGENTE: string
  DES_CLIENTE: string
  DES_CONVENZIONATO: string
  DES_PUNTO_VENDITA: string
  DES_SUBAGENTE: string
  "ESITO CHIAMATE": null
  IMPORTO_FINANZIATO: string
  IMPORTO_NETTO_EROGATO: string
  IMPORTO_RATA: number
  INDIRIZZO_CLI: string
  LOCALITA_CLI: string
  MOD_PAGAMENTO: string
  NOTE: null
  NUMERO_RATE: number
  OPERATORE: null
  PRATICA: number
  PRODOTTO: number
  PROVINCIA_CLI: string
  PUNTO_VENDITA: number
  REGIONE: string
  SITUAZIONE: string
  STATO: null
  SUBAGENTE: number
  TABELLA_FINANZ: string
}

export interface WaveImportType {
  "Ambito lavorativo (ex 'Dip Pub')": string
  "CAP Residenza": number
  "Call Center": string
  "Canale Assegnato": string
  "Canale di Contatto": string
  "Canale di provenienza": string
  "Carta di Credito": string
  "Cliente Coobbligato": string
  "Codice Fiscale": string
  "Codice Iniziativa": null
  "Codice NDG": number
  "Codice Prodotto Pratica": number
  Cognome: string
  "Comune di residenza": string
  "Contattato con DEM/SMS/DM": string
  Contocarta: string
  "Data Erogazione": number
  "Data Estinzione": number
  "Data di Nascita": string
  "Datore di Lavoro": string
  "Debito Residuo": number
  "Descrizione Iniziativa": null
  "Descrizione PdV": string
  "Descrizione Prodotto Pratica": string
  "Descrizione Stato Pratica": string
  Email: string
  Età: number
  Garante: string
  "Importo Finanziato": number
  "Importo Rata": number
  "Importo Richiesto": number
  "Indirizzo di residenza": string
  "Modalità di Pagamento": string
  N_Transazioni_Accredito: null
  N_Transazioni_Addebito: null
  Nome: string
  "N° pratiche Operative": number
  "N° rate Pagate": number
  "N° rate Residue": number
  "N° rate pratica": number
  Occupazione: string
  "Provincia di residenza": string
  Reddito: number
  Region: string
  'Target (ex "tipo offerta")': string
  "Tasso Pratica": number
  "Telefono Definitivo": number
  "Tipo Contratto": string
  data_scadenza: string
  "n° Pratica": number
}

export type StandardRow = Nullable<StandardImportType>
export type WaveRow = Nullable<WaveImportType>
