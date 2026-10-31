import { Fragment } from "react"
import { type DayRange } from "@mito/domain/analytics/window"
import { toast } from "@/components/ui/use-toast"
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard"
import {
  downloadBlob,
  exportHeader,
  fileName,
  isExportable,
  toCsv,
  toTsv,
} from "../_lib/export"
import { type Table } from "../_lib/results"
import { DataTable } from "./DataTable"
import { type ExportPage, contextOf, downloadWorkbook } from "./exportContext"
import { ExportButtons } from "./ExportButtons"
import { type ChartView } from "./useAnalisi"

/** What the row says when a chart has no table (AC26, AC31) */
const LOADING_ROW = "Il grafico sta caricando."
const FAILED_ROW = "Il grafico non si è caricato."
/** Not the text of the panel's box, which the page already says once (AC23) */
const SESSION_ROW = "La sessione è scaduta."

/** What a file is written from: the header rows, the table and the window of its answer */
type TableFile = {
  header: string[][]
  table: Table
  window: DayRange
}

/**
 * The file name, which breaks only after an `_` and never inside a word
 * (AC38): each piece holds together, the break is offered after the `_`
 */
function FileName({ name }: { name: string }) {
  const pieces = name.split("_")
  return (
    <span className="break-normal font-mono">
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">
            {i < pieces.length - 1 ? `${piece}_` : piece}
          </span>
          {i < pieces.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </span>
  )
}

/** The row under «Dati del grafico»: the rows of the file and its name, or why there is no table */
function RowLine({ view }: { view: ChartView }) {
  const { state } = view
  switch (state.kind) {
    case "loading":
      return <>{LOADING_ROW}</>
    case "session":
      return <>{SESSION_ROW}</>
    case "error":
      return <>{FAILED_ROW}</>
    case "result": {
      const { result } = state
      if (isExportable(result)) {
        const rows = result.table.rows.length
        return (
          <>
            {rows} {rows === 1 ? "riga" : "righe"}, le stesse del file ·{" "}
            <FileName name={fileName(view.id, state.window, "csv")} />
          </>
        )
      }
      return (
        <>
          {result.status.kind === "empty" ? result.status.reason : FAILED_ROW}
        </>
      )
    }
  }
}

/**
 * «Dati del grafico» under every chart, always there (AC2): the rows of the
 * file with its name, the buttons that write it, and the table. A chart that
 * loads, failed or is empty has no table, and the row says why (AC26, AC31).
 * The files are written from the table the page shows, with the window of the
 * answer that produced it (AC30)
 */
export function DataSection({
  view,
  page,
}: {
  view: ChartView
  page: ExportPage
}) {
  const [, copy] = useCopyToClipboard()
  const { state } = view
  const ready =
    state.kind === "result" && isExportable(state.result) ? state : null

  /** Runs `write` on the file of the table, read at the click (AC30); nothing without a table */
  const writeFile = (write: (file: TableFile) => unknown) => () => {
    if (ready === null) return
    const header = exportHeader(
      ready.result,
      contextOf(view, ready, page, new Date())
    )
    void write({ header, table: ready.result.table, window: ready.window })
  }

  const onCsv = writeFile(({ header, table, window }) =>
    downloadBlob(
      new Blob([toCsv(header, table)], { type: "text/csv;charset=utf-8" }),
      fileName(view.id, window, "csv")
    )
  )

  const onExcel = writeFile(({ header, table, window }) =>
    downloadWorkbook(
      [{ name: view.title, header, table }],
      fileName(view.id, window, "xlsx")
    )
  )

  const onCopy = writeFile(async ({ header, table }) => {
    if (await copy(toTsv(header, table)))
      toast({
        title: "Tabella copiata",
        description: "Pronta da incollare in un foglio.",
      })
    else toast({ title: "Copia non riuscita", variant: "destructive" })
  })

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Dati del grafico</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <RowLine view={view} />
          </p>
        </div>
        <ExportButtons
          disabled={ready === null}
          onCsv={onCsv}
          onExcel={onExcel}
          onCopy={onCopy}
        />
      </div>
      {ready === null ? null : (
        <div className="mt-3">
          <DataTable table={ready.result.table} />
        </div>
      )}
    </div>
  )
}
