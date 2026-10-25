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

/** Today's CSV pass of the import: a header row, numbers typed but the codes. */
export const parseImportCsv = <T>(file: string): Papa.ParseResult<T> =>
  Papa.parse<T>(file, {
    header: true,
    dynamicTyping: (field) => !TEXT_COLUMNS.has(String(field)),
  })

/**
 * The rows of the first sheet of an import file, as today's import reads them:
 * the sheet becomes CSV (dates as Excel shows them) and papaparse types the
 * values. `headers` is the first row as it is in the sheet, `fields` the names
 * papaparse gave its columns. The CSV has a line for every row of the sheet,
 * so the row `index` of `rows` is row `firstRow + index` in Excel. `textOf`
 * gives rows of the sheet as Excel shows them, for the error report (D16).
 */
export function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet?.["!ref"]) {
    return {
      headers: [],
      rows: [],
      errors: [],
      fields: [],
      firstRow: 2,
      textOf: () => new Map<number, string[]>(),
    }
  }
  const range = XLSX.utils.decode_range(sheet["!ref"])
  const [headers = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: { s: range.s, e: { r: range.s.r, c: range.e.c } },
  })
  const { data, errors, meta } = parseImportCsv<Record<string, unknown>>(
    XLSX.utils.sheet_to_csv(sheet)
  )
  // The header is row `range.s.r + 1` of Excel, counted from 1
  const firstRow = range.s.r + 2
  const textOf = (excelRows: readonly number[]) => {
    const text = new Map<number, string[]>()
    for (const excelRow of excelRows) {
      const r = excelRow - 1
      if (r < range.s.r || r > range.e.r) continue
      const cells: string[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
          XLSX.CellObject | undefined
        cells.push(cell ? XLSX.utils.format_cell(cell) : "")
      }
      text.set(excelRow, cells)
    }
    return text
  }
  return {
    headers,
    rows: data,
    errors,
    fields: meta.fields ?? [],
    firstRow,
    textOf,
  }
}
