import * as XLSX from "xlsx"
import type { CallStats, CallTotals } from "@mito/domain/export/calls"
import type { ExportPeriod } from "@mito/domain/export/period"

const header = [
  "Operatore",
  "Chiamate effettuate",
  "Risposte",
  "Appuntamenti fissati",
  "Non risposte",
]

const totalsOf = (row: CallTotals) => [
  row.calls,
  row.answered,
  row.appointments,
  row.noAnswer,
]

/**
 * The calls export as an Excel workbook: one sheet, one row per operator in
 * the order of `stats.rows`, then the totals (AC13). Built in the browser from
 * the numbers on the page, so the file and the charts never disagree (AC19).
 */
export function buildCallStatsWorkbook(stats: CallStats): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([
    header,
    ...stats.rows.map((row) => [
      `${row.surname} ${row.name}`.trim(),
      ...totalsOf(row),
    ]),
    ["Totale", ...totalsOf(stats.totals)],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Chiamate")
  return workbook
}

/** `chiamate_<first day>_<last day>.xlsx` (AC13). */
export const callStatsFileName = ({ from, to }: ExportPeriod) =>
  `chiamate_${from}_${to}.xlsx`

/** Saves the workbook of `stats` in the browser, named after `period`. */
export function downloadCallStats(stats: CallStats, period: ExportPeriod) {
  XLSX.writeFile(buildCallStatsWorkbook(stats), callStatsFileName(period))
}
