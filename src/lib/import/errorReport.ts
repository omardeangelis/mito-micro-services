import * as XLSX from "xlsx"
import { romeWallClock } from "@mito/domain/utils/romeClock"

// The report is built here, from the values the preview already holds as text,
// so that codes keep their zeros ("00185") and no file of the import leaves the
// browser (AC15)
const pad = (n: number, width = 2) => String(n).padStart(width, "0")

/** `errori_import_<file without its last extension>_<AAAA-MM-GG, Rome day>.xlsx` */
function reportFileName(fileName: string, today: Date): string {
  const dot = fileName.lastIndexOf(".")
  const base = dot === -1 ? fileName : fileName.slice(0, dot)
  const { year, month, day } = romeWallClock(today.getTime())
  return `errori_import_${base}_${pad(year, 4)}-${pad(month + 1)}-${pad(day)}.xlsx`
}

/**
 * The Excel error report of an import preview: one sheet, one row per discarded
 * row, with every reason of that row (not only the first). The row's cells follow
 * `headers`; a cell the sheet does not have is empty.
 */
export function buildErrorReport(input: {
  headers: readonly string[]
  sheetRows: ReadonlyMap<number, readonly string[]>
  discarded: readonly { row: number; reasons: readonly string[] }[]
  fileName: string
  today: Date
}): { fileName: string; bytes: Uint8Array<ArrayBuffer> } {
  const body = input.discarded.map(({ row, reasons }) => {
    const cells = input.sheetRows.get(row) ?? []
    return [
      row,
      reasons.join("; "),
      ...input.headers.map((_, column) => cells[column] ?? ""),
    ]
  })
  const sheet = XLSX.utils.aoa_to_sheet<string | number>([
    ["Riga", "Errori", ...input.headers],
    ...body,
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Errori")
  // The typings give `write` as `any`; with type "array" it is an ArrayBuffer
  const written = XLSX.write(book, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return {
    fileName: reportFileName(input.fileName, input.today),
    bytes: new Uint8Array(written),
  }
}
