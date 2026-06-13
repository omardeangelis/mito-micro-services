import { type TaskStatus } from "../types/schemas"

export type TaskPriority = {
  id: number
  state: TaskStatus | null
  deadline?: Date | null
  customerId: string
  closedAt?: Date | null
  dataLiquidazione?: Date | null
  customPriority: boolean
}

export const calculatePriority = (task: TaskPriority) => {
  let priority = 0

  // Stato del Cliente
  if (task.state === "chiamare") {
    priority = 120
  } else if (task.state === "richiamare") {
    // Prossimità di scadenza dell'Alert
    if (task.deadline && new Date(task.deadline) < new Date()) {
      priority += 20
    }
    // Ultima chiamata effettuata
    if (task.closedAt) {
      const daysSinceLastCall = Math.floor(
        Date.now() -
          Date.parse(task.closedAt.toDateString()) / (1000 * 60 * 60 * 24)
      )

      priority += Math.min(30, daysSinceLastCall) // Up to 30 points for long periods
    }
    // Data di Liquidazione
    if (task.dataLiquidazione) {
      const daysUntilLiquidation = Math.floor(
        Date.now() -
          Date.parse(task.dataLiquidazione.toDateString()) /
            (1000 * 60 * 60 * 24)
      )
      priority += Math.max(0, 20 - daysUntilLiquidation) // Up to 20 points
    }
  } else if (task.state === "non interessato") {
    priority = 10 // Lower base priority
  } else {
    priority = 1 // Lowest priority for all other states
  }

  return priority
}
