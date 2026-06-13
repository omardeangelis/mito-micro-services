import { type PgColumn } from "drizzle-orm/pg-core"

export type FilterType = Record<string, string[]>

export function generateFilter<T extends FilterType>(
  map: Map<string, string>,
  initialFilters: T
) {
  const filters = Array.from(map.entries()).reduce(
    (acc, curr) => {
      if (acc[curr[0] as keyof typeof filters]) {
        // @ts-expect-error we know that curr[0] is a key of filters
        acc[curr[0] as keyof typeof filters].push(curr[1].split("-"))
      } else {
        // @ts-expect-error we know that curr[0] is a key of filters
        acc[curr[0] as keyof typeof filters] = [curr[1].split("-")].flat()
      }
      return acc
    },
    JSON.parse(JSON.stringify(initialFilters)) as T
  )
  return filters satisfies T
}

type Operatortypes = "eq" | "gt" | "lt" | "gte" | "lte"

type CustomFilter = {
  id: string
  name: string
  value: string
  operator: Operatortypes
}

const filterSymbolMap = new Map<Operatortypes, string>([
  ["eq", "="],
  ["gt", ">"],
  ["lt", "<"],
  ["gte", ">="],
  ["lte", "<="],
])

export const createFilterFromString = (
  filter: string
): Omit<CustomFilter, "id"> | null => {
  const [name, operator, value] = filter.split(":")
  if (!name || !operator || !value) {
    return null
  }
  return {
    name,
    operator: operator as Operatortypes,
    value,
  }
}

const createSQLFilter = (
  filter: Omit<CustomFilter, "id">,
  schemaMap: Map<string, PgColumn>
) => {
  const symbol = filterSymbolMap.get(filter.operator)
  const dataType = schemaMap.get(filter.name)?.dataType
  const columnType = schemaMap.get(filter.name)?.columnType
  const isString = dataType === "string" && columnType !== "PgEnumColumn"
  if (isString && filter.operator === "eq") {
    return `${filter.name} ilike` + " " + `'%${filter.value}%'`
  }

  return `${filter.name} ${symbol}` + " " + `'${filter.value}'`
}

export const createSQLQuery = (
  filters: string[],
  schemaMap: Map<string, PgColumn>,
  selectedTable?: string
) => {
  let filtersObj = filters.map(createFilterFromString).filter(Boolean) as Omit<
    CustomFilter,
    "id"
  >[]

  if (selectedTable) {
    console.log(selectedTable, "selectedTable")
    filtersObj = filtersObj.filter((f) =>
      schemaMap.get(f.name)?.uniqueName?.includes(selectedTable)
    )
  }

  return filtersObj.map((f) => createSQLFilter(f, schemaMap)).join(" AND ")
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
