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
  const download = async () => {
    setSaving(true)
    try {
      // `xlsx` is heavy: it loads only when an admin asks for the file
      const { downloadCallStats } =
        await import("@/lib/export/callStatsWorkbook")
      downloadCallStats(stats, period)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Button onClick={download} disabled={saving}>
      Scarica Excel
    </Button>
  )
}
