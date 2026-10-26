import {
  and,
  eq,
  gt,
  gte,
  ilike,
  lt,
  lte,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import {
  type AdvancedFilter,
  type FilterOperator,
  filterKindOf,
  operatorsFor,
  validateAndFormatDate,
} from "@mito/domain/filters/advanced"
import { containsPattern } from "./sql"

// I filtri avanzati `{ field, op, value }` tradotti in condizioni drizzle.
// Colonna e operatore si cercano in `Map` chiuse, il valore arriva al SQL
// solo come parametro legato. Una voce non valida si scarta, senza errore.

/** Voci considerate: le altre si scartano. */
const MAX_FILTERS = 20
/** Lunghezza massima di un valore. */
const MAX_VALUE_LENGTH = 255

type Compare = (column: PgColumn, value: SQLWrapper) => SQL

// Una `Map` e non un oggetto: `__proto__` e `constructor` restano sconosciuti
const COMPARE = new Map<FilterOperator, Compare>([
  ["eq", eq],
  ["gt", gt],
  ["lt", lt],
  ["gte", gte],
  ["lte", lte],
])

const INTEGER_RANGE = new Map<string, readonly [number, number]>([
  ["PgSmallInt", [-32768, 32767]],
  ["PgInteger", [-2147483648, 2147483647]],
])

const INTEGER = /^[+-]?\d+$/
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

// Il valore va come parametro di un template `sql`, non come secondo
// argomento di `eq`/`gt`: lì drizzle lo passerebbe all'encoder della colonna,
// e quello di `timestamp` chiama `toISOString()`. Così resta una stringa e
// Postgres la converte nel fuso della sessione, come il letterale di prima
const bound = (value: string) => sql`${value}`

function integerValue(column: PgColumn, value: string): SQL | undefined {
  const range = INTEGER_RANGE.get(column.columnType)
  const trimmed = value.trim()
  if (!range || !INTEGER.test(trimmed)) return undefined
  const [min, max] = range
  const n = Number(trimmed)
  return n >= min && n <= max ? bound(trimmed) : undefined
}

function decimalValue(value: string): SQL | undefined {
  // La stringa e non `Number(value)`: niente arrotondamenti
  const trimmed = value.trim()
  return DECIMAL.test(trimmed) ? bound(trimmed) : undefined
}

function dateValue(value: string): SQL | undefined {
  const date = validateAndFormatDate(value.trim())
  if (!date || Number(date.slice(0, 4)) < 1) return undefined
  return bound(date)
}

/** Il valore di una colonna numerica o di data, legato; `undefined` se non è valido. */
function comparableValue(column: PgColumn, value: string): SQL | undefined {
  switch (filterKindOf(column)) {
    case "integer":
      return integerValue(column, value)
    case "decimal":
      return decimalValue(value)
    case "date":
      return dateValue(value)
    default:
      return undefined
  }
}

/** La condizione della voce, `undefined` se non è valida. */
function filterCondition(
  { field, op, value }: AdvancedFilter,
  columns: ReadonlyMap<string, PgColumn>
): SQL | undefined {
  if (value.length > MAX_VALUE_LENGTH) return undefined
  const column = columns.get(field)
  if (!column) return undefined
  const operator = operatorsFor(column).find((allowed) => allowed === op)
  if (!operator) return undefined

  switch (filterKindOf(column)) {
    case "enum":
      return column.enumValues?.includes(value) ? eq(column, value) : undefined
    case "text":
      // Su testo `eq` è "contiene"; il valore resta com'è, senza trim.
      // Postgres rifiuta il byte NUL in un parametro: la voce si scarta
      return value.length > 0 && !value.includes("\u0000")
        ? ilike(column, containsPattern(value))
        : undefined
    default: {
      const bindValue = comparableValue(column, value)
      const compare = COMPARE.get(operator)
      return bindValue && compare?.(column, bindValue)
    }
  }
}

/**
 * Il `where` dei filtri avanzati sulle colonne della mappa: le voci valide
 * in AND, `undefined` se non ne resta nessuna.
 */
export function advancedFiltersWhere(
  filters: readonly AdvancedFilter[] | undefined,
  columns: ReadonlyMap<string, PgColumn>
): SQL | undefined {
  return and(
    ...(filters ?? [])
      .slice(0, MAX_FILTERS)
      .map((filter) => filterCondition(filter, columns))
  )
}
