import { type Message } from "@/lib/types/schemas"
import type * as XLSX from "xlsx"
import { type DateRange } from "react-day-picker"
import { type ZodIssue } from "zod"
import { type StandardImportFile, type WaveFile } from "./types"
import { type fetchTasks } from "@/app/api/export/utils"

const formatFileName = (filename: string, name: string) => {
  if (name === "") return filename
  // Divide la stringa filename in due parti
  const firstPart = filename.split(/\d/)[0] // Prima parte fino al primo numero
  const restPart = filename.substring(firstPart ? firstPart.length : 0) // Seconda parte dopo il primo numero
  // Formatta il nome: tutto minuscolo e spazi sostituiti da trattini
  const formattedName = name.toLowerCase().replace(/\s+/g, "-")
  const result = `${firstPart}${formattedName}-${restPart}`
  return result
}
const formatDate = (date: Date) => {
  const day = new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(date)
  const month = new Intl.DateTimeFormat("it-IT", {
    month: "2-digit",
  }).format(date)
  const year = new Intl.DateTimeFormat("it-IT", { year: "numeric" }).format(
    date
  )
  return `${day}-${month}-${year}`
}

const _formatDateForFileName = (date: Date | undefined) => {
  if (!date) return ""
  // Assicuriamoci che sia una Date valida
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export const createFilePath = (
  tabValue: string,
  interval: DateRange,
  isAdmin: boolean,
  operatorSurname: string
) => {
  const from = formatDate(interval.from!)
  const to = formatDate(interval.to!)

  let fileName = ""
  switch (tabValue) {
    case "default":
      fileName = `export-clienti-pratiche-${from}-${to}.xlsx`
      break
    case "call":
      fileName = `export-chiamate-${from}-${to}.xlsx`
      if (!isAdmin) fileName = formatFileName(fileName, operatorSurname)
      break
  }
  return fileName
}

export const customerSheetHeader = [
  "Nome",
  "Cognome",
  "Codice fiscale",
  "Partita iva",
  "Età",
  "Email",
  "Numero di telefono",
  "Data di nascita",
  "Indirizzo",
  "CAP",
  "Comune",
  "Provincia",
  "Reddito",
  "Occupazione",
  "Ambito lavorativo",
]

export const practicesSheetHeader = [
  "Id",
  "Importo finanziato",
  "Importo erogato",
  "Rate totali",
  "Rate pagate",
  "Importo rata",
  "Debito residuo",
  "Data liquidazione",
  "Importo richiesto",
  "Tasso pratica",
  "Metodo di pagamento",
  "Stato pratica",
  "Prodotto",
]

export const callSheetHeader = [
  "Nome completo",
  "Numero di telefono",
  "Codice fiscale",
  "Importo finanziato",
  "Asseganto a",
  "Stato chiamate",
  "Data assegnazione",
  "Data chiamata",
  "Note",
]

export const headerStyle = {
  fill: { fgColor: { rgb: "FFAACCFF" } },
  font: { bold: true },
  alignment: { horizontal: "center" },
}

export type ExportTabValue = "default" | "call"

export const formatMessages = (messages: Message[]) => {
  return messages
    .map((message) => {
      const sendDate = new Date(message.sendDate)
      const { formattedDate, formattedTime } = formatDates(sendDate)
      return `[${formattedDate} ${formattedTime}] ${message.content}`
    })
    .join("; ")
}

export const formatTaskClosedAt = (date: Date) => {
  console.log("date", date)
  const { formattedDate, formattedTime } = formatDates(date)
  return `${formattedDate} ${formattedTime}`
}

export const formatDates = (date: Date) => {
  const formattedDate = date.toLocaleDateString("it-IT")
  const formattedTime = date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return {
    formattedDate: formattedDate,
    formattedTime: formattedTime,
  }
}

export const formatCurrencyColumn = (
  sheet: XLSX.WorkSheet,
  data: string[][]
) => {
  // Applica la formattazione di valuta alla colonna 4 (indice 3)
  const currencyColumn = "D" // Colonna 4 (indice 3)
  for (let i = 2; i <= data.length; i++) {
    // Inizia da 2 per evitare l'header
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const cell = sheet[`${currencyColumn}${i}`]
    if (cell) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      cell.z = "€#,##0.00" // Formato valuta in Euro
    } else {
      sheet[`${currencyColumn}${i}`] = { t: "n", z: "€#,##0.00" } // Imposta il formato per le celle vuote
    }
  }
}

export const formatFileNameDate = (fileName: string) => {
  const date = new Date()
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  const formattedDate = `${day}-${month}-${year}`
  return `${fileName}-${formattedDate}.xlsx`
}

export type FetchTask = Awaited<ReturnType<typeof fetchTasks>>

const concatErrorMessages = (errors: ZodIssue[]): string => {
  return errors.map((obj) => obj.message).join(", ")
}

export const getWaveRowData = (
  waveError: WaveFile,
  waveErrorMessages: ZodIssue[]
) => {
  return [
    concatErrorMessages(waveErrorMessages),
    waveError["Canale Assegnato"] ?? "",
    waveError["Descrizione PdV"] ?? "",
    waveError.Region ?? "",
    waveError["Canale di provenienza"] ?? "",
    waveError['Target (ex "tipo offerta")'] ?? "",
    waveError["Codice NDG"]?.toString() ?? "",
    waveError["Codice Fiscale"] ?? "",
    waveError.Nome ?? "",
    waveError.Cognome ?? "",
    waveError["Data di Nascita"] ?? "",
    waveError.Età?.toString() ?? "",
    waveError["CAP Residenza"]?.toString() ?? "",
    waveError["Indirizzo di residenza"] ?? "",
    waveError["Comune di residenza"] ?? "",
    waveError["Provincia di residenza"] ?? "",
    waveError["Telefono Definitivo"]?.toString() ?? "",
    waveError.Email ?? "",
    waveError["N° pratiche Operative"]?.toString() ?? "",
    waveError["n° Pratica"]?.toString() ?? "",
    waveError["Data Erogazione"]?.toString() ?? "",
    waveError["Descrizione Stato Pratica"] ?? "",
    waveError["Debito Residuo"]?.toString() ?? "",
    waveError["Data Estinzione"]?.toString() ?? "",
    waveError["Importo Richiesto"]?.toString() ?? "",
    waveError["Importo Finanziato"]?.toString() ?? "",
    waveError["N° rate pratica"]?.toString() ?? "",
    waveError["N° rate Pagate"]?.toString() ?? "",
    waveError["N° rate Residue"]?.toString() ?? "",
    waveError["Tasso Pratica"]?.toString() ?? "",
    waveError["Modalità di Pagamento"] ?? "",
    waveError["Importo Rata"]?.toString() ?? "",
    waveError["Descrizione Prodotto Pratica"] ?? "",
    waveError["Codice Prodotto Pratica"]?.toString() ?? "",
    waveError.Garante ?? "",
    waveError["Cliente Coobbligato"] ?? "",
    waveError["Codice Iniziativa"] ?? "",
    waveError["Descrizione Iniziativa"] ?? "",
    waveError.Reddito?.toString() ?? "",
    waveError.Occupazione ?? "",
    waveError["Datore di Lavoro"] ?? "",
    waveError["Ambito lavorativo (ex 'Dip Pub')"] ?? "",
    waveError["Tipo Contratto"] ?? "",
    waveError.Contocarta ?? "",
    waveError["Carta di Credito"] ?? "",
    waveError["Canale di Contatto"] ?? "",
    waveError["Call Center"] ?? "",
    waveError["Contattato con DEM/SMS/DM"] ?? "",
  ]
}

export const getStandardRowData = (
  standardError: StandardImportFile,
  standardErrorMessages: ZodIssue[]
) => {
  return [
    concatErrorMessages(standardErrorMessages),
    standardError.PRATICA?.toString() ?? "",
    standardError.REGIONE ?? "",
    standardError.PUNTO_VENDITA?.toString() ?? "",
    standardError.DES_PUNTO_VENDITA ?? "",
    standardError.CONVENZIONATO?.toString() ?? "",
    standardError.DES_CONVENZIONATO ?? "",
    standardError.SUBAGENTE?.toString() ?? "",
    standardError.DES_SUBAGENTE ?? "",
    standardError.AGENTE?.toString() ?? "",
    standardError.DES_AGENTE ?? "",
    standardError.SITUAZIONE ?? "",
    standardError.CLIENTE?.toString() ?? "",
    standardError.DES_CLIENTE ?? "",
    standardError.CODICE_FISCALE_CLI ?? "",
    standardError.PRODOTTO?.toString() ?? "",
    standardError.TABELLA_FINANZ ?? "",
    standardError.NUMERO_RATE?.toString() ?? "",
    standardError.IMPORTO_RATA?.toString() ?? "",
    standardError.IMPORTO_FINANZIATO ?? "",
    standardError.IMPORTO_NETTO_EROGATO ?? "",
    standardError.DATA_CARICAMENTO ?? "",
    standardError.DATA_LIQUIDAZIONE ?? "",
    standardError.MOD_PAGAMENTO ?? "",
    standardError.INDIRIZZO_CLI ?? "",
    standardError.CAP_CLIENTE ?? "",
    standardError.LOCALITA_CLI ?? "",
    standardError.PROVINCIA_CLI ?? "",
    standardError["ESITO CHIAMATE"] ?? "",
    standardError.STATO ?? "",
    standardError.DATA ?? "",
    standardError.OPERATORE ?? "",
    standardError.NOTE ?? "",
  ]
}

export const adjustFromAndTo = (dateRange: DateRange) => {
  const fromDate = dateRange.from!
  const toDate = dateRange.to!

  fromDate.setHours(7, 0, 0, 0)
  toDate.setHours(23, 59, 0, 0)
  return dateRange
}

export const getChatIds = (data: FetchTask) => {
  return data
    .map((item) => item.customers.chatId) // Estrae tutti i chatId
    .filter((chatId) => chatId !== null) // Filtra i chatId non null
}
