"use server"

import { type TaskStatus } from "@/lib/types/schemas"
import { getTaskStatusDirection } from "../_utils"
import { api } from "@/trpc/server"
import { revalidatePath } from "next/cache"

type Params = {
  oldState: TaskStatus
  newState: TaskStatus
  taskId: number | null
  customerId: string
  operatorId: number | null
  isActive: boolean
}

export const taskStatusAction = async ({
  oldState,
  newState,
  taskId,
  customerId,
  operatorId,
  isActive,
}: Params) => {
  const direction = getTaskStatusDirection(oldState, newState)
  if (!taskId) {
    await api.task.createTask.mutate({
      customerId,
      operatorId,
      state: "chiamare",
    })
  } else {
    if (direction === "reopen") {
      let lastUpdate: null | Date = null
      const task = await api.task.getTaskById.query({ id: taskId })
      lastUpdate = task[0]?.closedAt ?? null
      await api.task.createTask.mutate({
        customerId,
        operatorId,
        state: "chiamare",
        closedAt: lastUpdate,
      })
      await api.task.updateTaskFromDashboard.mutate({
        id: taskId,
        isActive: false,
      })
    } else {
      await api.task.updateTask.mutate({
        id: taskId,
        state: newState,
        operatorId,
        isClosed: direction === "close",
        isActive,
      })
    }
  }
  await api.customer.updateLastEdit.mutate({ id: customerId })

  revalidatePath("/dashboard/customers", "layout")
}
