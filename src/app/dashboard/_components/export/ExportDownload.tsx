"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { CallStats } from "@mito/domain/export/calls"
import type { ExportPeriod } from "@mito/domain/export/period"

/** Saves the numbers on the page as an Excel file (AC13, AC19). */
export function ExportDownload({
  stats,
  period,
}: {
  stats: CallStats
  period: ExportPeriod
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const download = async () => {
    setSaving(true)
    setFailed(false)
    try {
      // `xlsx` is heavy: it loads only when an admin asks for the file
      const { downloadCallStats } =
        await import("@mito/client/export/callStatsWorkbook")
      downloadCallStats(stats, period)
    } catch (error) {
      console.error("Export download failed:", error)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-sm text-red-600">
          File non creato, riprova
        </span>
      )}
      <Button onClick={download} disabled={saving}>
        Scarica Excel
      </Button>
    </div>
  )
}
