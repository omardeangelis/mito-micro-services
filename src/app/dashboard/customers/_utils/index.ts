import { stateCategory } from "@/lib/domain/contact/status"
import { type TaskCategory, type TaskStatus } from "@/lib/types/schemas"

export const getTaskStatusCategory = (state: TaskStatus): TaskCategory =>
  stateCategory(state)
