import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { getTableColumns } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import { z } from "zod"

// Filtri avanzati di Clienti e Pratiche: le colonne ammesse, il tipo di
// ciascuna, gli operatori per tipo e la lettura del parametro
// `filter=nome:op:valore` dell'URL. Le usano sia il popover sia il server.
// Le mappe sono `Map` e non oggetti: `__proto__`, `constructor` e `toString`
// restano nomi sconosciuti.

const {
  birthdayDate,
  age,
  source,
  comune,
  sede,
  phoneNumber,
  ambitoLavorativo,
  occupazione,
} = getTableColumns(customers)

/** Colonne filtrabili di Clienti, per etichetta mostrata nel popover. */
export const CUSTOMER_FILTER_MAP = new Map<string, PgColumn>([
  ["Compleanno", birthdayDate],
  ["Età", age],
  ["Fonte", source],
  ["Comune", comune],
  ["Sede", sede],
  ["Telefono", phoneNumber],
  ["Ambito", ambitoLavorativo],
  ["Occupazione", occupazione],
])

/** Le stesse colonne, per nome della colonna nel database. */
export const CUSTOMER_FILTER_QUERY_MAP = new Map<string, PgColumn>(
  Array.from(CUSTOMER_FILTER_MAP.values(), (column) => [column.name, column])
)

const {
  dataLiquidazione,
  debitoResiduo,
  importoFinanziato,
  ratePagate,
  state: praticaState,
  importoErogato,
  importoRichiesto,
  rateTotali,
  region,
  importoRata,
} = getTableColumns(practices)

/** Colonne filtrabili di Pratiche, per etichetta mostrata nel popover. */
export const PRATICA_FILTER_MAP = new Map<string, PgColumn>([
  ["Liquidato il", dataLiquidazione],
  ["Debito", debitoResiduo],
  ["Finanzato", importoFinanziato],
  ["Rate pagate", ratePagate],
  ["Stato", praticaState],
  ["Erogato", importoErogato],
  ["Richiesto", importoRichiesto],
  ["Rate totali", rateTotali],
  ["Regione", region],
  ["Rata", importoRata],
])

/** Le stesse colonne, per nome della colonna nel database. */
export const PRATICA_FILTER_QUERY_MAP = new Map<string, PgColumn>(
  Array.from(PRATICA_FILTER_MAP.values(), (column) => [column.name, column])
)

export const FILTER_OPERATORS = ["eq", "gt", "lt", "gte", "lte"] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export type FilterKind = "enum" | "text" | "integer" | "decimal" | "date"

// Il tipo si legge da `columnType`, non da `dataType`: in drizzle `numeric`
// ha `dataType` "string" come le colonne di testo
const KIND_BY_COLUMN_TYPE = new Map<string, FilterKind>([
  ["PgEnumColumn", "enum"],
  ["PgVarchar", "text"],
  ["PgText", "text"],
  ["PgChar", "text"],
  ["PgSmallInt", "integer"],
  ["PgInteger", "integer"],
  ["PgNumeric", "decimal"],
  ["PgTimestamp", "date"],
])

/** Tipo di filtro della colonna, `undefined` se non è filtrabile. */
export function filterKindOf(column: PgColumn): FilterKind | undefined {
  return KIND_BY_COLUMN_TYPE.get(column.columnType)
}

const ONLY_EQ: readonly FilterOperator[] = ["eq"]
const NONE: readonly FilterOperator[] = []

/** Operatori ammessi sulla colonna: su testo ed enum solo `eq`. */
export function operatorsFor(column: PgColumn): readonly FilterOperator[] {
  switch (filterKindOf(column)) {
    case "enum":
    case "text":
      return ONLY_EQ
    case "integer":
    case "decimal":
    case "date":
      return FILTER_OPERATORS
    default:
      return NONE
  }
}

/**
 * Un filtro letto dall'URL, ancora da validare (lo fa il server). Stringhe
 * libere: nell'input delle procedure una voce non valida si scarta, non rende
 * invalida la richiesta
 */
export const advancedFilterSchema = z.object({
  field: z.string(),
  op: z.string(),
  value: z.string(),
})

export type AdvancedFilter = z.infer<typeof advancedFilterSchema>

// Legge `nome:op:valore`. Tiene le prime tre parti, come oggi: `a:eq:10:30`
// dà il valore `10`. Una parte mancante o vuota non è un filtro.
export function parseFilterParam(param: string): AdvancedFilter | null {
  const [field, op, value] = param.split(":")
  if (!field || !op || !value) return null
  return { field, op, value }
}

/** Legge il parametro `filter` assente, singolo o ripetuto. */
export function parseFilterParams(
  filter: string | string[] | undefined
): AdvancedFilter[] {
  const params = filter === undefined ? [] : [filter].flat()
  return params.flatMap((param) => parseFilterParam(param) ?? [])
}

/**
 * Validates and formats a date string in the format 'aaaa-mm-dd'.
 * - Ensures the format is correct.
 * - Ensures the date exists.
 * - Adds leading zeros to month and day if necessary.
 *
 * @param dateStr - The date string to validate and format.
 * @returns The formatted date string if valid, otherwise null.
 */
export const validateAndFormatDate = (dateStr: string): string | null => {
  // Regular expression to match the date format
  const dateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  const match = dateStr.match(dateRegex)

  if (!match) {
    return null
  }

  const [_, year, ...rest] = match
  let [month, day] = rest

  if (!month || !day || !year) {
    return null
  }

  // Add leading zeros if necessary
  if (month.length === 1) {
    month = "0" + month
  }
  if (day.length === 1) {
    day = "0" + day
  }

  // Create a date object
  const date = new Date(`${year}-${month}-${day}`)

  // Check if the date is valid
  if (
    date.getFullYear() !== parseInt(year, 10) ||
    date.getMonth() + 1 !== parseInt(month, 10) ||
    date.getDate() !== parseInt(day, 10)
  ) {
    return null
  }

  return `${year}-${month}-${day}`
}
