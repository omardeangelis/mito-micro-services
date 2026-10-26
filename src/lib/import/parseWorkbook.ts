import * as XLSX from "xlsx"
import * as Papa from "papaparse"

// Codes that papaparse must not turn into numbers: zeros in front and long
// digits matter
const TEXT_COLUMNS = new Set([
  "Codice NDG",
  "CLIENTE",
  "CODICE_FISCALE_CLI",
  "Codice Fiscale",
  "n° Pratica",
  "PRATICA",
])

/**
 * Today's CSV pass of the import: a header row, numbers typed but the codes.
 * The names are trimmed, as `detectFormat` reads them.
 */
export const parseImportCsv = <T>(file: string): Papa.ParseResult<T> =>
  Papa.parse<T>(file, {
    header: true,
    transformHeader: (header) => header.trim(),
    dynamicTyping: (field) => !TEXT_COLUMNS.has(String(field)),
  })

/**
 * The rows of the first sheet of an import file, as today's import reads them:
 * the sheet becomes CSV (dates as Excel shows them) and papaparse types the
 * values. `headers` is the first row as it is in the sheet.
 */
export function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet?.["!ref"]) return { headers: [], rows: [], errors: [] }
  const range = XLSX.utils.decode_range(sheet["!ref"])
  const [headers = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: { s: range.s, e: { r: range.s.r, c: range.e.c } },
  })
  const { data, errors } = parseImportCsv<Record<string, unknown>>(
    XLSX.utils.sheet_to_csv(sheet)
  )
  return { headers, rows: data, errors }
}
