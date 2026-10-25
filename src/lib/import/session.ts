import {
  type Cells,
  type NumberedRow,
  classifyRows,
  isBlankRow,
} from "@mito/domain/import/classify"
import { type ImportFormat, detectFormat } from "@mito/domain/import/formats"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import {
  type LookupKeys,
  MAX_ROWS,
  toFileBody,
} from "@mito/domain/import/payload"
import {
  type CrmState,
  type ImportPlan,
  planRows,
} from "@mito/domain/import/plan"
import { buildErrorReport } from "./errorReport"
import { fileMessages, formatProblem } from "./messages"
import { parseWorkbook } from "./parseWorkbook"

// What the worker of the import does with a file (T14, D2, D3): it reads it,
// classifies the rows with the code the server runs again (AC12), plans them
// against what `import.lookup` finds, and keeps the rows until the admin
// confirms or cancels. Only the numbers, the row numbers and the compressed
// body leave it: the rows themselves never reach the page, the console or the
// server before the confirmation (AC17, AC31)

/** A file read by the worker, until it is confirmed or cancelled. */
export type ImportSession = {
  fileName: string
  format: ImportFormat
  /** The names papaparse gave the columns: the body's columns */
  columns: string[]
  /** The rows that aren't blank, with their number in Excel */
  rows: { row: number; cells: Cells }[]
  classified: NumberedRow[]
  /** The row of the headers in Excel */
  headerRow: number
  textOf: (rows: readonly number[]) => Map<number, string[]>
  plan?: ImportPlan
}

export type ReadResult =
  | { ok: false; message: string }
  | { ok: true; session: ImportSession; keys: LookupKeys }

/** The rows of a file and the keys to look up in the CRM, or why not. */
export function readImport(
  buffer: ArrayBuffer,
  fileName: string,
  now: Date
): ReadResult {
  let parsed: ReturnType<typeof parseWorkbook>
  try {
    parsed = parseWorkbook(buffer)
  } catch {
    return { ok: false, message: fileMessages.unreadable }
  }
  // A sheet that starts below row 1 has its first row empty (AC6)
  if (parsed.firstRow !== 2) {
    return { ok: false, message: fileMessages.emptyHeaders }
  }
  const detected = detectFormat(parsed.headers)
  if ("error" in detected) {
    return { ok: false, message: formatProblem(detected) }
  }
  const rows = parsed.rows
    .map((cells, index) => ({ row: parsed.firstRow + index, cells }))
    .filter(({ cells }) => !isBlankRow(cells))
  if (rows.length > MAX_ROWS) {
    return { ok: false, message: fileMessages.tooManyRows }
  }
  const classified = classifyRows(detected.format, rows, now, fileName)
  return {
    ok: true,
    keys: lookupKeys(groupRows(classified)),
    session: {
      fileName,
      format: detected.format,
      columns: parsed.fields,
      rows,
      classified,
      headerRow: parsed.firstRow - 1,
      textOf: parsed.textOf,
    },
  }
}

/** The preview of a file: its numbers and what it will discard (AC7, AC8). */
export type Preview = {
  format: ImportFormat
  counts: ImportPlan["counts"]
  /** The row numbers of the discarded rows, with their reasons (AC13) */
  discarded: ImportPlan["discarded"]
  /** The rows the import writes, sent with the confirmation (D10) */
  expected: number[]
}

/** The plan of the file against what the CRM has for its keys. */
export function previewImport(session: ImportSession, crm: CrmState): Preview {
  const plan = planRows(session.classified, crm)
  session.plan = plan
  return {
    format: session.format,
    counts: plan.counts,
    discarded: plan.discarded,
    expected: plan.expected,
  }
}

/** The rows in the compact form of D3, gzipped, as `import.upload` takes them. */
export async function compressedBody(session: ImportSession) {
  const json = JSON.stringify(toFileBody(session.columns, session.rows))
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The error report of the preview, from the sheet as Excel shows it (D16). */
export function errorReport(session: ImportSession, today: Date) {
  const discarded = session.plan?.discarded ?? []
  const text = session.textOf([
    session.headerRow,
    ...discarded.map(({ row }) => row),
  ])
  return buildErrorReport({
    headers: text.get(session.headerRow) ?? session.columns,
    sheetRows: text,
    discarded,
    fileName: session.fileName,
    today,
  })
}
