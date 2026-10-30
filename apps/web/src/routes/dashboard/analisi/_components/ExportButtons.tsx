import { CopyIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * «CSV», «Excel» and «Copia» of a chart (AC27–AC29): disabled while the chart
 * loads and when it has no table (AC26, AC31). Nothing between them and the
 * chart takes the focus, so Tab reaches «CSV» straight from the controls
 * above it (AC34)
 */
export function ExportButtons({
  disabled,
  onCsv,
  onExcel,
  onCopy,
}: {
  disabled: boolean
  onCsv: () => void
  onExcel: () => void
  onCopy: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={disabled} onClick={onCsv}>
        <FileTextIcon aria-hidden="true" /> CSV
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onExcel}>
        <FileSpreadsheetIcon aria-hidden="true" /> Excel
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onCopy}>
        <CopyIcon aria-hidden="true" /> Copia
      </Button>
    </div>
  )
}
