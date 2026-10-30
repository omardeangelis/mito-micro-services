import { useRef } from "react"
import { PRESETS, type Preset, type Range } from "@mito/domain/analytics/window"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { oneOf } from "../_lib/urlState"

/** The names of the ready-made windows in the menu of the periods (AC9) */
const PRESET_LABELS: Record<Preset, string> = {
  "7d": "Gli ultimi 7 giorni",
  "30d": "Gli ultimi 30 giorni",
  "90d": "Gli ultimi 90 giorni",
  ytd: "L'anno in corso",
  "12m": "Gli ultimi 12 mesi",
}

/**
 * The menu of the periods (AC9): the ready-made windows, then «Date
 * personalizzate…», which opens the calendar. With a custom window the
 * menu has no item selected and says «Date personalizzate», so choosing that
 * item again still opens the calendar. The calendar opens once the menu has
 * closed, so the focus doesn't go back to the menu
 */
export function PeriodSelect({
  range,
  onPreset,
  onCustom,
}: {
  range: Range
  onPreset: (preset: Preset) => void
  onCustom: () => void
}) {
  const wantsCalendar = useRef(false)
  return (
    <Select
      value={range === "custom" ? "" : range}
      onValueChange={(value) => {
        const preset = oneOf(PRESETS, value)
        if (preset !== undefined) onPreset(preset)
        else wantsCalendar.current = true
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Periodo"
        className="max-w-full data-[placeholder]:text-foreground"
      >
        <SelectValue placeholder="Date personalizzate" />
      </SelectTrigger>
      <SelectContent
        align="start"
        onCloseAutoFocus={(event) => {
          if (!wantsCalendar.current) return
          wantsCalendar.current = false
          event.preventDefault()
          onCustom()
        }}
      >
        {PRESETS.map((preset) => (
          <SelectItem key={preset} value={preset}>
            {PRESET_LABELS[preset]}
          </SelectItem>
        ))}
        <SelectItem value="custom">Date personalizzate…</SelectItem>
      </SelectContent>
    </Select>
  )
}
