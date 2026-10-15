import { stateCategory } from "@/lib/domain/contact/status"
import { type TaskCategory, type TaskStatus } from "@/lib/types/schemas"

type TaskMap = Record<TaskCategory, TaskStatus[]>

export const taskStatusMap = {
  idle: ["nessuno"],
  open: ["chiamare", "followup"],
  close: ["app.to", "caricato", "erogata", "non interessato", "richiamare"],
} satisfies TaskMap

export const getTaskStatusCategory = (state: TaskStatus): TaskCategory =>
  stateCategory(state)

type StatusDirection = "close" | "persist" | "reopen"

export const getTaskStatusDirection = (
  oldState: TaskStatus,
  newState: TaskStatus
): StatusDirection => {
  const oldCategory = getTaskStatusCategory(oldState)
  const newCategory = getTaskStatusCategory(newState)

  if (oldCategory === "idle" && newCategory === "open") {
    return "persist"
  }

  if (oldCategory === "open" && newCategory === "close") {
    return "close"
  }

  if (oldCategory === "close" && newCategory === "open") {
    return "reopen"
  }

  return "persist"
}
