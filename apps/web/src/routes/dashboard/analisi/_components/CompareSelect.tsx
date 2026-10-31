import { COMPARES, type Compare } from "@mito/domain/analytics/window"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { oneOf } from "../_lib/urlState"

/** What the window is compared with, in words (AC10) */
const COMPARE_LABELS: Record<Compare, string> = {
  previous: "Periodo precedente",
  "last-year": "Stesso periodo, anno prima",
  none: "Nessuno",
}

/** The comparison of the page (AC10): it applies to every chart */
export function CompareSelect({
  compare,
  onChange,
}: {
  compare: Compare
  onChange: (compare: Compare) => void
}) {
  return (
    <Select
      value={compare}
      onValueChange={(value) => {
        const next = oneOf(COMPARES, value)
        if (next !== undefined) onChange(next)
      }}
    >
      <SelectTrigger size="sm" aria-label="Confronto" className="max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {COMPARES.map((item) => (
          <SelectItem key={item} value={item}>
            {COMPARE_LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
