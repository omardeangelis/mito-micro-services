import React from "react"
import { Badge } from "@/components/ui/badge"
import { stateTone } from "@/lib/tones"
import { type TaskStatus } from "@mito/domain/schemas"

/** The state of a contact as a badge, colored by its own tone (AC16). */
export const TaskStatusBadge = React.memo(
  ({ status }: { status: TaskStatus }) => {
    return <Badge tone={stateTone(status)}>{status}</Badge>
  }
)

TaskStatusBadge.displayName = "TaskStatusBadge"
