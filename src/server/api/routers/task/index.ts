import { createTRPCRouter } from "../../trpc"
import { createTask, createAlert, bulkHandleTask } from "./POST"
import { updateTask, updateTaskFromDashboard } from "./PUT"
import { deleteTasks, resolveAlerts } from "./DELETE"
import {
  getTasksToExport,
  getActiveAlerts,
  getCustomerAlerts,
  getAllAvaibleTaskStatus,
  getTaskById,
  getActiveTask,
  getCustomersWithActiveAlerts,
} from "./GET"

export const taskRouter = createTRPCRouter({
  getTaskById,
  createTask,
  updateTask,
  updateTaskFromDashboard,
  bulkHandleTask,
  deleteTasks,
  resolveAlerts,
  getActiveAlerts,
  getCustomerAlerts,
  createAlert,
  getTasksToExport,
  getAllAvaibleTaskStatus,
  getActiveTask,
  getCustomersWithActiveAlerts,
})
