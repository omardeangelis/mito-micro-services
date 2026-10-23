"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ExportPeriod as Period } from "@mito/domain/export/period"

type Props = {
  period: Period
  first: string
  last: string
  onChange: (period: Period) => void
}

/** The first and last day of the export, inside the selectable days (AC11b, AC16). */
export function ExportPeriod({ period, first, last, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <Label htmlFor="export-from">Dal</Label>
        <Input
          id="export-from"
          type="date"
          min={first}
          max={period.to < last ? period.to : last}
          value={period.from}
          onChange={(event) =>
            onChange({ ...period, from: event.target.value })
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="export-to">Al</Label>
        <Input
          id="export-to"
          type="date"
          min={period.from > first ? period.from : first}
          max={last}
          value={period.to}
          onChange={(event) => onChange({ ...period, to: event.target.value })}
        />
      </div>
    </div>
  )
}
