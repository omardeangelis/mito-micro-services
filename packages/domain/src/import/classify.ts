import { getTableColumns, type Column } from "drizzle-orm"
import { type ZodIssue } from "zod"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { type CustomerRole } from "@mito/db/schema/relations/customerToPratica"
import {
  insertCustomerSchema,
  insertPracticeSchema,
  type PracticeWrite,
} from "../schemas"
import { type StandardRow, type WaveRow } from "./convert/rows"
import { standardCustomer, standardPractice } from "./convert/standard"
import { getCustomerRole } from "./convert/values"
import {
  type ConvertedCustomer,
  waveCustomer,
  wavePractice,
} from "./convert/wave"
import {
  type StandardColumn,
  type WaveColumn,
  type ImportFormat,
} from "./formats"
import {
  type Subject,
  columnsSubject,
  fileNameSubject,
  reasons,
} from "./messages"

// The outcome of one row of an import file (AC8): imported with its practice,
// only the customer, or discarded with every reason (AC9–AC11, AC13). Pure:
// the UI shows it in the preview, the server checks it again (AC12).

/** A row of the file as papaparse gives it: column → value. */
export type Cells = Readonly<Record<string, unknown>>

export type ClassifiedRow =
  | {
      kind: "importable"
      customer: ConvertedCustomer
      practice: PracticeWrite
      role: CustomerRole
    }
  | { kind: "customerOnly"; customer: ConvertedCustomer }
  | { kind: "discarded"; reasons: string[] }

/** A classified row with its number in the sheet, as Excel shows it. */
export type NumberedRow = ClassifiedRow & { row: number }

/** The data a row needs to be imported with its practice (AC9). */
export const requiredColumns = {
  standard: [
    "PRATICA",
    "IMPORTO_FINANZIATO",
    "CLIENTE",
    "IMPORTO_NETTO_EROGATO",
    "IMPORTO_RATA",
    "NUMERO_RATE",
    "DATA_LIQUIDAZIONE",
  ],
  wave: [
    "n° Pratica",
    "Codice NDG",
    "Importo Finanziato",
    "Importo Rata",
    "Importo Richiesto",
    "N° rate pratica",
    "Data Erogazione",
  ],
} as const satisfies {
  standard: readonly StandardColumn[]
  wave: readonly WaveColumn[]
}

/** No value: nothing, or a text of blanks. 0 is a value. */
export const isMissing = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "")

/** A row without a value in any cell: not a row of the file (AC8). */
export const isBlankRow = (cells: Cells) =>
  Object.values(cells).every(isMissing)

/** Where a value of the CRM comes from, for its reason. */
type Source = {
  subject: Subject
  /** Read as a date: whatever is wrong, the date can't be read */
  date?: true
  /** Computed by the import: the reason names what and from which columns */
  computed?: { what: string; columns: readonly string[] }
  /** The fields it is computed from: when one has a reason, that one is enough */
  from?: readonly string[]
}

type Sources<T> = Partial<Record<keyof T & string, Source>>

const read = (...columns: string[]): Source => ({
  subject: columnsSubject(...columns),
})
const readDate = (column: string): Source => ({
  subject: columnsSubject(column),
  date: true,
})
const fromFileName: Source = { subject: fileNameSubject }
const computed = (
  what: string,
  columns: readonly string[],
  from: readonly string[]
): Source => ({
  subject: columnsSubject(...columns),
  computed: { what, columns },
  from,
})

type Layout = {
  /** The column of the customer's code and of its fiscal code or VAT number */
  customerCode: string
  fiscalCode: string
  customer: (cells: Cells, fileName: string, now: Date) => ConvertedCustomer
  practice: (cells: Cells, fileName: string, now: Date) => PracticeWrite
  role: (cells: Cells) => CustomerRole
  customerSources: Sources<ConvertedCustomer>
  practiceSources: Sources<PracticeWrite>
}

const WAVE_RATES = ["Data Erogazione", "N° rate pratica", "Importo Rata"]

const layouts: Record<ImportFormat, Layout> = {
  standard: {
    customerCode: "CLIENTE",
    fiscalCode: "CODICE_FISCALE_CLI",
    customer: (cells, fileName) =>
      standardCustomer(cells as StandardRow, fileName),
    practice: (cells, fileName, now) =>
      standardPractice(cells as StandardRow, fileName, now),
    role: () => "Intestatario",
    customerSources: {
      tempID: read("CLIENTE"),
      fullName: read("DES_CLIENTE"),
      name: read("DES_CLIENTE"),
      surname: read("DES_CLIENTE"),
      fiscalCode: read("CODICE_FISCALE_CLI"),
      vatCode: read("CODICE_FISCALE_CLI"),
      sede: read("DES_SUBAGENTE"),
      address: read("INDIRIZZO_CLI"),
      cap: read("CAP_CLIENTE"),
      comune: read("LOCALITA_CLI"),
      provincia: read("PROVINCIA_CLI"),
      fileName: fromFileName,
    },
    practiceSources: {
      praticaId: read("PRATICA"),
      region: read("REGIONE"),
      desPuntoVendita: read("DES_SUBAGENTE"),
      desConvenzionato: read("DES_CONVENZIONATO"),
      subagente: read("SUBAGENTE"),
      state: read("SITUAZIONE"),
      dataLiquidazione: readDate("DATA_LIQUIDAZIONE"),
      rateTotali: read("NUMERO_RATE"),
      importoRata: read("IMPORTO_RATA"),
      importoFinanziato: read("IMPORTO_FINANZIATO"),
      importoErogato: read("IMPORTO_NETTO_EROGATO"),
      paymentMethod: read("MOD_PAGAMENTO"),
      productId: read("PRODOTTO"),
      fileName: fromFileName,
      // The rates read the date with `new Date()`: NaN when it can't
      ratePagate: {
        ...readDate("DATA_LIQUIDAZIONE"),
        from: ["rateTotali", "importoRata"],
      },
      debitoResiduo: computed(
        "il debito residuo",
        ["DATA_LIQUIDAZIONE", "NUMERO_RATE", "IMPORTO_RATA"],
        ["ratePagate", "rateTotali", "importoRata"]
      ),
    },
  },
  wave: {
    customerCode: "Codice NDG",
    fiscalCode: "Codice Fiscale",
    customer: (cells, fileName, now) =>
      waveCustomer(cells as WaveRow, fileName, now),
    practice: (cells, fileName, now) =>
      wavePractice(cells as WaveRow, fileName, now),
    role: (cells) => getCustomerRole(cells as WaveRow),
    customerSources: {
      tempID: read("Codice NDG"),
      fullName: read("Nome", "Cognome"),
      name: read("Nome"),
      surname: read("Cognome"),
      fiscalCode: read("Codice Fiscale"),
      vatCode: read("Codice Fiscale"),
      email: read("Email"),
      birthdayDate: readDate("Data di Nascita"),
      age: read("Età"),
      phoneNumber: read("Telefono Definitivo"),
      address: read("Indirizzo di residenza"),
      cap: read("CAP Residenza"),
      comune: read("Comune di residenza"),
      provincia: read("Provincia di residenza"),
      reddito: read("Reddito"),
      occupazione: read("Occupazione"),
      ambitoLavorativo: read("Ambito lavorativo (ex 'Dip Pub')"),
      tipoContratto: read("Tipo Contratto"),
      sede: read("Descrizione PdV"),
      fileName: fromFileName,
    },
    practiceSources: {
      praticaId: read("n° Pratica"),
      region: read("Region"),
      desPuntoVendita: read("Descrizione PdV"),
      paymentMethod: read("Modalità di Pagamento"),
      state: read("Descrizione Stato Pratica"),
      dataLiquidazione: readDate("Data Erogazione"),
      dataEstinzione: readDate("Data Estinzione"),
      rateTotali: read("N° rate pratica"),
      importoRata: read("Importo Rata"),
      importoRichiesto: read("Importo Richiesto"),
      importoFinanziato: read("Importo Finanziato"),
      tassoPratica: read("Tasso Pratica"),
      productId: read("Codice Prodotto Pratica"),
      fileName: fromFileName,
      importoErogato: computed(
        "l'importo erogato",
        ["N° rate pratica", "Importo Rata"],
        ["rateTotali", "importoRata"]
      ),
      ratePagate: computed("le rate pagate", WAVE_RATES, [
        "dataLiquidazione",
        "rateTotali",
        "importoRata",
      ]),
      debitoResiduo: computed("il debito residuo", WAVE_RATES, [
        "dataLiquidazione",
        "rateTotali",
        "importoRata",
        "ratePagate",
      ]),
    },
  },
}

/** How the CRM stores a customer or a practice. */
type Entity = {
  schema: {
    safeParse: (
      value: unknown
    ) => { success: true } | { success: false; error: { issues: ZodIssue[] } }
  }
  columns: Record<string, Column>
  fallback: Source
}

const customerEntity: Entity = {
  // The ids come at insert
  schema: insertCustomerSchema.omit({ id: true, uniqueHash: true }),
  columns: getTableColumns(customers),
  fallback: { subject: { text: "Un dato del cliente", many: false } },
}

const practiceEntity: Entity = {
  schema: insertPracticeSchema,
  columns: getTableColumns(practices),
  fallback: { subject: { text: "Un dato della pratica", many: false } },
}

/**
 * The outcome of a row of a file of the layout. `fileName` is the name the CRM
 * stores (`parseFileName`), `now` the clock of the import.
 */
export function classifyRow(
  format: ImportFormat,
  cells: Cells,
  now: Date,
  fileName: string
): ClassifiedRow {
  const layout = layouts[format]
  const missing = requiredColumns[format].filter((column: string) =>
    isMissing(cells[column])
  )
  // Today's rule: a Wave row without the practice's data but with the
  // customer's codes imports the customer
  const customerOnly =
    format === "wave" &&
    missing.length > 0 &&
    !isMissing(cells[layout.customerCode]) &&
    !isMissing(cells[layout.fiscalCode])

  const found: string[] = customerOnly
    ? []
    : missing.map((column) => reasons.missing(column))
  if (isMissing(cells[layout.fiscalCode])) {
    found.push(reasons.missingFiscalData)
  }

  let customer: ConvertedCustomer | null = null
  let practice: PracticeWrite | null = null
  try {
    if (!isMissing(cells[layout.customerCode])) {
      customer = layout.customer(cells, fileName, now)
    }
    if (missing.length === 0) practice = layout.practice(cells, fileName, now)
  } catch {
    // The conversion assumes text where a cell can be a number
    return { kind: "discarded", reasons: [...found, reasons.unreadableRow] }
  }

  if (customer) {
    found.push(
      ...valueReasons(customer, customerEntity, layout.customerSources)
    )
  }
  if (practice) {
    found.push(
      ...valueReasons(practice, practiceEntity, layout.practiceSources)
    )
  }

  if (found.length === 0 && customer) {
    if (practice) {
      return {
        kind: "importable",
        customer,
        practice,
        role: layout.role(cells),
      }
    }
    if (customerOnly) return { kind: "customerOnly", customer }
  }
  return { kind: "discarded", reasons: [...new Set(found)] }
}

/** The rows of a file, blank ones left out (they aren't rows, AC8). */
export function classifyRows(
  format: ImportFormat,
  rows: readonly { row: number; cells: Cells }[],
  now: Date,
  fileName: string
): NumberedRow[] {
  return rows
    .filter(({ cells }) => !isBlankRow(cells))
    .map(({ row, cells }) => ({
      ...classifyRow(format, cells, now, fileName),
      row,
    }))
}

type Problem =
  | { kind: "tooLong"; max: number }
  | {
      kind:
        | "notANumber"
        | "notAnInteger"
        | "outOfRange"
        | "notADate"
        | "notText"
        | "invalid"
    }

/** Why a value can't be stored (AC11), field by field in the table's order. */
function valueReasons(
  value: object,
  entity: Entity,
  sources: Partial<Record<string, Source>>
): string[] {
  const fields = value as Record<string, unknown>
  const parsed = entity.schema.safeParse(value)
  const issues = new Map<string, Problem>()
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0])
      if (!issues.has(field)) issues.set(field, problemOf(issue))
    }
  }

  const problems = new Map<string, Problem>()
  for (const [field, column] of Object.entries(entity.columns)) {
    const problem = issues.get(field) ?? storageProblem(column, fields[field])
    if (problem) problems.set(field, problem)
  }

  return [...problems].flatMap(([field, problem]) => {
    const source = sources[field] ?? entity.fallback
    if (source.from?.some((other) => problems.has(other))) return []
    return [reasonOf(source, problem)]
  })
}

function problemOf(issue: ZodIssue): Problem {
  switch (issue.code) {
    case "too_big":
      return issue.type === "string"
        ? { kind: "tooLong", max: Number(issue.maximum) }
        : { kind: "outOfRange" }
    case "too_small":
      return { kind: "outOfRange" }
    case "invalid_date":
      return { kind: "notADate" }
    case "invalid_type":
      if (issue.expected === "number") return { kind: "notANumber" }
      if (issue.expected === "date") return { kind: "notADate" }
      if (issue.expected === "string") return { kind: "notText" }
      return { kind: "invalid" }
    default:
      return { kind: "invalid" }
  }
}

const SMALLINT_MAX = 32_767
const INTEGER_MAX = 2_147_483_647

/** What the database refuses and drizzle-zod doesn't check. */
function storageProblem(column: Column, value: unknown): Problem | null {
  switch (column.columnType) {
    case "PgSmallInt":
      return integerProblem(value, SMALLINT_MAX)
    case "PgInteger":
      return integerProblem(value, INTEGER_MAX)
    case "PgNumeric":
      // An amount the conversion couldn't read is "NaN"
      return typeof value === "string" && !Number.isFinite(Number(value))
        ? { kind: "notANumber" }
        : null
    default:
      return null
  }
}

function integerProblem(value: unknown, max: number): Problem | null {
  if (typeof value !== "number") return null
  if (!Number.isFinite(value)) return { kind: "notANumber" }
  if (!Number.isInteger(value)) return { kind: "notAnInteger" }
  if (value > max || value < -max - 1) return { kind: "outOfRange" }
  return null
}

function reasonOf(source: Source, problem: Problem): string {
  if (source.computed) {
    return reasons.cannotCompute(source.computed.what, source.computed.columns)
  }
  if (source.date) return reasons.notADate(source.subject)
  switch (problem.kind) {
    case "tooLong":
      return reasons.tooLong(source.subject, problem.max)
    case "notANumber":
      return reasons.notANumber(source.subject)
    case "notAnInteger":
      return reasons.notAnInteger(source.subject)
    case "outOfRange":
      return reasons.outOfRange(source.subject)
    case "notADate":
      return reasons.notADate(source.subject)
    case "notText":
      return reasons.notText(source.subject)
    case "invalid":
      return reasons.invalid(source.subject)
  }
}
