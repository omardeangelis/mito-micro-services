import { formatRange } from "@mito/domain/analytics/buckets"
import { comparisonOf } from "@mito/domain/analytics/window"
import { cn } from "@/lib/utils"
import { type PageState } from "../_lib/urlState"

/**
 * The window and its comparison in words, above the indicators (AC9, AC10):
 * «1 – 30 ott 2026 · confronto: 1 – 30 set 2026»
 */
export function WindowSummary({
  state,
  className,
}: {
  state: PageState
  className?: string
}) {
  const comparison = comparisonOf(state.window, state.compare)
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {formatRange(state.window)}
      {comparison === null
        ? " · senza confronto"
        : ` · confronto: ${formatRange(comparison)}`}
    </p>
  )
}
