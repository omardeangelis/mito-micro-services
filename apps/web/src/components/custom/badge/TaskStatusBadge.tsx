import React from "react"
import { Badge } from "@/components/ui/badge"
import { stateTone } from "@/lib/tones"
import { stateLabel } from "@mito/domain/contact/status"
import { type TaskStatus } from "@mito/domain/schemas"

/**
 * The state of a contact as a badge, colored by its own tone and labelled by
 * its own label (AC1). `alertDay` (`YYYY-MM-DD`) is the day of the open alert:
 * a Richiamo shows it as «Richiamo · gg/mm», the callers that have the alert
 * pass it.
 */
export const TaskStatusBadge = React.memo(
  ({ status, alertDay }: { status: TaskStatus; alertDay?: string | null }) => {
    return (
      <Badge tone={stateTone(status)}>{stateLabel(status, alertDay)}</Badge>
    )
  }
)

TaskStatusBadge.displayName = "TaskStatusBadge"
