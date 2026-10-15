import React from "react"
import { cva } from "class-variance-authority"
import { Badge } from "@/components/ui/badge"
import { stateCategory } from "@/lib/domain/contact/status"
import { type TaskCategory, type TaskStatus } from "@/lib/types/schemas"

export const activeVariants = cva("", {
  variants: {
    state: {
      idle: "bg-gray-100 text-grey-800",
      open: "bg-green-100 text-green-800",
      close: "bg-blue-100 text-blue-800",
    } satisfies Record<TaskCategory, string>,
  },
  defaultVariants: { state: "idle" },
})

/** The state of a contact as a badge, colored by its category. */
export const TaskStatusBadge = React.memo(
  ({ status }: { status: TaskStatus }) => {
    return (
      <Badge
        variant={"outline"}
        size={"xs"}
        className={activeVariants({ state: stateCategory(status) })}
      >
        {status}
      </Badge>
    )
  }
)

TaskStatusBadge.displayName = "TaskStatusBadge"
