import { createTRPCRouter } from "../../trpc"
import { createTask, createContact, createAlert, bulkHandleTask } from "./POST"
import { changeState, updateTask, updateTaskFromDashboard } from "./PUT"
import { deleteTasks, resolveAlert, resolveAlerts } from "./DELETE"
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
  createContact,
  changeState,
  updateTask,
  updateTaskFromDashboard,
  bulkHandleTask,
  deleteTasks,
  resolveAlerts,
  resolveAlert,
  getActiveAlerts,
  getCustomerAlerts,
  createAlert,
  getTasksToExport,
  getAllAvaibleTaskStatus,
  getActiveTask,
  getCustomersWithActiveAlerts,
})
