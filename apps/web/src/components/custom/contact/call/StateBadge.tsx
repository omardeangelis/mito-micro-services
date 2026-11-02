import { stateLabel } from "@mito/domain/contact/status"
import { type TaskStatus } from "@mito/domain/schemas"
import { Badge } from "@/components/ui/badge"
import { stateTone } from "@/lib/tones"

/**
 * The state of a contact as a badge, with the label of the domain (AC1):
 * Richiamo carries the day of the open alert (`alertDay`, `YYYY-MM-DD`).
 */
export function StateBadge({
  state,
  alertDay,
}: {
  state: TaskStatus | null
  alertDay?: string | null | undefined
}) {
  return <Badge tone={stateTone(state)}>{stateLabel(state, alertDay)}</Badge>
}
