import { formatRange } from "@mito/domain/analytics/buckets"
import type {
  Bucketing,
  Compare,
  DayRange,
} from "@mito/domain/analytics/window"
import type { WorkBook } from "xlsx"
import {
  CHART_TITLES,
  DASH,
  formatCell,
  type ColumnFormat,
  type ChartResult,
  type Table,
} from "./results"
import type { ChartId } from "./charts"

/**
 * The files of the Analysis page, built in the browser from the table under
 * the chart so the file and the screen never disagree (D12). No React here;
 * `xlsx` loads only when a workbook is built, never with the page.
 */

/** What the page knows about the answer a file is written from. */
export type ExportContext = {
  /** The window of the data that arrived, not of the controls (AC30) */
  window: DayRange
  comparison: DayRange | null
  compare: Compare
  /** `null` for the charts without grouping (the rankings) */
  group: Bucketing | null
  /** «tutta la rete» for the admin, the operator's name otherwise (AC30) */
  dataOf: string
  extractedAt: Date
}

const GROUP_LABELS: Record<Bucketing, string> = {
  day: "per giorno",
  week: "per settimana",
  month: "per mese",
}

/** «Estratto il»: `DD/MM/YYYY HH:MM` on the clock of Rome, whatever the machine zone. */
function formatExtractedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`
}

/** The «Confronto» line: which period the window is compared with. */
function comparisonLabel(context: ExportContext): string {
  if (context.compare === "none" || context.comparison === null) {
    return "Nessuno"
  }
  const range = formatRange(context.comparison)
  return context.compare === "last-year"
    ? `Stesso periodo, anno prima: ${range}`
    : `Periodo precedente: ${range}`
}

/**
 * The rows `[label, value]` written above the table of every file (AC30):
 * title, question, window, comparison, grouping, whose data, when, then the
 * notes. The contacts with an outcome are a snapshot of now, so they say
 * «Adesso» instead of window, comparison and grouping (AC7).
 */
export function exportHeader(
  result: ChartResult<unknown>,
  context: ExportContext
): string[][] {
  const rows: string[][] = [
    ["Grafico", result.title],
    ["Domanda", result.question],
  ]
  if (result.id === "progress") {
    rows.push(["Finestra", "Adesso"])
  } else {
    rows.push(["Finestra", formatRange(context.window)])
    rows.push(["Confronto", comparisonLabel(context)])
    if (context.group !== null) {
      rows.push(["Raggruppamento", GROUP_LABELS[context.group]])
    }
  }
  rows.push(["Dati di", context.dataOf])
  rows.push(["Estratto il", formatExtractedAt(context.extractedAt)])
  for (const note of result.notes) rows.push(["Nota", note])
  if (result.kpi.delta?.kind === "none") {
    rows.push(["Nota", result.kpi.delta.note])
  }
  if (result.scope !== null) rows.push(["Nota", result.scope])
  return rows
}

/** «Finanziato per sede» becomes `finanziato-per-sede`. */
const slugOf = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")

/**
 * `mito_<chart>_<from>_<to>.<ext>` (AC30); the contacts with an outcome carry
 * only the day of the snapshot, which the page passes as the window (AC7).
 */
export function fileName(
  chart: ChartId,
  window: DayRange,
  ext: "csv" | "xlsx"
): string {
  const slug = slugOf(CHART_TITLES[chart])
  return chart === "progress"
    ? `mito_${slug}_${window.to}.${ext}`
    : `mito_${slug}_${window.from}_${window.to}.${ext}`
}

/** `mito_analisi_<from>_<to>.xlsx`, the workbook of «Esporta tutto» (AC32). */
export const allFileName = (window: DayRange) =>
  `mito_analisi_${window.from}_${window.to}.xlsx`

/**
 * A value of a text file (a branch, an operator, a note) that Excel would read
 * as a formula keeps its text: a leading `'` makes it a plain value. The
 * triggers are `= + - @`, a leading tab or CR, and any of the first four after
 * spaces. It is the writers' job, so the header rows are covered as well as
 * the table.
 */
const FORMULA_START = /^(?:[\t\r]|\s*[=+\-@])/
const asText = (value: string) =>
  FORMULA_START.test(value) ? `'${value}` : value

/** A tab or a line break inside a value of the clipboard becomes a space. */
const flatten = (value: string) => value.replace(/[\t\r\n]+/g, " ")

/**
 * The cell as it is written in a text file: Italian numbers, «—» for null
 * (AC24); a text from the data goes through `guard`, a number never does
 * ("-5" stays a number)
 */
const textRows = (table: Table, guard: (text: string) => string): string[][] =>
  table.rows.map((row) =>
    row.map((cell, i) =>
      typeof cell === "string"
        ? guard(cell)
        : formatCell(cell, table.columns[i]?.format ?? "text")
    )
  )

/** The lines of a text file: header rows, an empty line, column names, rows. */
const layout = (
  header: string[][],
  table: Table,
  guard: (text: string) => string
): string[][] => [
  // «Dati di» is an operator's name, the notes may quote the data
  ...header.map((line) => line.map(guard)),
  [],
  table.columns.map((column) => column.header),
  ...textRows(table, guard),
]

/** A CSV value: quoted when it holds `;`, a quote or a line break. */
const csvValue = (value: string) =>
  /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/**
 * The CSV for Italian Excel (AC27): BOM, `;` as separator, `\r\n` lines,
 * decimal comma. The rows are the table's, in its order (AC30).
 */
export function toCsv(header: string[][], table: Table): string {
  return (
    "\uFEFF" +
    layout(header, table, asText)
      .map((line) => line.map(csvValue).join(";"))
      .join("\r\n")
  )
}

/** A clipboard value: quoted when it holds a quote, as Excel reads a pasted cell. */
const tsvValue = (value: string) =>
  value.includes('"') ? `"${value.replaceAll('"', '""')}"` : value

/**
 * The same layout as the CSV, tab-separated and with no BOM, for the
 * clipboard (AC29). A tab or a line break inside a value becomes a space
 * before the formula guard looks at it, and a value with a quote is quoted:
 * a pasted `"=1+1"` would lose its quotes and run.
 */
export function toTsv(header: string[][], table: Table): string {
  return layout(header, table, (text) => asText(flatten(text)))
    .map((line) => line.map((v) => tsvValue(flatten(v))).join("\t"))
    .join("\n")
}

/** The name of a sheet: Excel allows 31 characters and none of `\ / ? * [ ] :`. */
const sheetName = (name: string, taken: Set<string>) => {
  const base =
    name
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 31) || "Foglio"
  let candidate = base
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    const suffix = ` ${n}`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

/** A number as the table shows it, still a number: 1 decimal for a rate, 2 for euro, whole for a count. */
const roundedCell = (cell: string | number, format: ColumnFormat) => {
  if (typeof cell === "string") return cell
  const decimals = { percent: 1, euro: 2, count: 0, text: null }[format]
  if (decimals === null) return cell
  const factor = 10 ** decimals
  // `|| 0`: a value that rounds to zero is zero, never -0
  return Math.round(cell * factor) / factor || 0
}

/**
 * The Excel workbook (AC28, AC32): one sheet per entry with the header rows,
 * an empty row, the column names and the rows, numbers kept as numbers and a
 * missing value as «—» (AC24). `xlsx` loads here, on demand.
 */
export async function toWorkbook(
  sheets: Array<{ name: string; header: string[][]; table: Table }>
): Promise<WorkBook> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.utils.book_new()
  const taken = new Set<string>()
  for (const { name, header, table } of sheets) {
    const rows: Array<Array<string | number>> = [
      ...header,
      [],
      table.columns.map((column) => column.header),
      ...table.rows.map((row) =>
        row.map((cell, i) =>
          cell === null
            ? DASH
            : roundedCell(cell, table.columns[i]?.format ?? "text")
        )
      ),
    ]
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName(name, taken)
    )
  }
  return workbook
}

/** The workbook as an `.xlsx` file, ready to download. */
export async function writeWorkbook(workbook: WorkBook): Promise<Blob> {
  const XLSX = await import("xlsx")
  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/**
 * Saves `content` as `name` through a temporary link. Returns `false` and never
 * throws when the browser refuses, so the page can say «Excel non scaricato.
 * Riprova.» (AC32).
 */
export function downloadBlob(content: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(content)
    const link = document.createElement("a")
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

/** «a», «a e b», «a, b e c». */
const listOf = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`

/** A chart with a table to export: ready, or number-only (AC32). */
export const isExportable = (result: ChartResult<unknown>) =>
  result.status.kind === "ready" || result.status.kind === "kpiOnly"

/**
 * What «Esporta tutto» writes (AC32): the charts with a table to export (see
 * `isExportable`), the button's label «Esporta tutto 5/6», and the toast that
 * names the charts left out; `null` when none is.
 */
export function exportAllSummary(
  results: ReadonlyArray<ChartResult<unknown>>
): {
  exported: ChartResult<unknown>[]
  label: string
  toast: string | null
} {
  const exported = results.filter(isExportable)
  const missing = results.filter((r) => !exported.includes(r))
  const total = results.length
  const label = `Esporta tutto ${exported.length}/${total}`
  if (missing.length === 0) return { exported, label, toast: null }
  const names = listOf(missing.map((r) => `"${r.title}"`))
  const verb = missing.length === 1 ? "non ha" : "non hanno"
  const done =
    exported.length === 1
      ? "Esportato 1 grafico"
      : `Esportati ${exported.length} grafici`
  return {
    exported,
    label,
    toast: `${done} su ${total}: ${names} ${verb} dati da esportare.`,
  }
}
