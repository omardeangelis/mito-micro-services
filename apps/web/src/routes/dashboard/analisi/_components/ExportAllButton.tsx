import { DownloadIcon } from "lucide-react"
import { type DayRange } from "@mito/domain/analytics/window"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import {
  allFileName,
  exportAllSummary,
  exportHeader,
  isExportable,
} from "../_lib/export"
import { type ChartResult } from "../_lib/results"
import { type ExportPage, contextOf, downloadWorkbook } from "./exportContext"
import { type ChartView } from "./useAnalisi"

/**
 * A chart with no answer (loading, failed, expired session) counts as one
 * with no data in the summary: it is in the total and it is named in the
 * toast, and it has no sheet
 */
const withoutData = (view: ChartView): ChartResult<unknown> => ({
  id: view.id,
  title: view.title,
  question: view.question,
  status: { kind: "empty", title: "", reason: "", action: null },
  kpi: { value: null, format: "count", caption: "", delta: null },
  points: [],
  table: { columns: [], rows: [] },
  notes: [],
  scope: null,
})

/**
 * «Esporta tutto» (AC32): one workbook, a sheet for each chart that has
 * data, over the charts the role sees. Disabled while any chart loads
 * (AC26) or none can be exported. The file takes its window from the
 * answers that arrived (they all echo the one of the page), `fallback`
 * while none has
 */
export function ExportAllButton({
  views,
  page,
  fallback,
}: {
  views: ChartView[]
  page: ExportPage
  fallback: DayRange
}) {
  const results = views.map((view) =>
    view.state.kind === "result" ? view.state.result : withoutData(view)
  )
  const summary = exportAllSummary(results)
  const loading = views.some((view) => view.state.kind === "loading")

  const onClick = async () => {
    const extractedAt = new Date()
    const sheets = views.flatMap((view) => {
      const { state } = view
      if (state.kind !== "result" || !isExportable(state.result)) return []
      return [
        {
          name: view.title,
          header: exportHeader(
            state.result,
            contextOf(view, state, page, extractedAt)
          ),
          table: state.result.table,
        },
      ]
    })
    const windowed = views.find(
      (view) => view.state.kind === "result" && view.id !== "progress"
    )
    const window =
      windowed?.state.kind === "result" ? windowed.state.window : fallback
    const done = await downloadWorkbook(sheets, allFileName(window))
    if (done && summary.toast !== null) toast({ title: summary.toast })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading || summary.exported.length === 0}
      onClick={() => void onClick()}
    >
      <DownloadIcon aria-hidden="true" />
      <span className="tabular-nums">{summary.label}</span>
    </Button>
  )
}
