import { createTRPCRouter } from "../../trpc"
import { createTask, bulkCreateTask, createAlert, bulkHandleTask } from "./POST"
import { updateTask, updateTaskFromDashboard } from "./PUT"
import { deleteTasks, deleteAlerts, resolveAlerts } from "./DELETE"
import {
  getTasksToExport,
  getActiveAlerts,
  getAllAvaibleTaskStatus,
  getTaskById,
  getActiveTask,
} from "./GET"

export const taskRouter = createTRPCRouter({
  getTaskById,
  createTask,
  updateTask,
  updateTaskFromDashboard,
  bulkCreateTask,
  bulkHandleTask,
  deleteTasks,
  deleteAlerts,
  resolveAlerts,
  getActiveAlerts,
  createAlert,
  getTasksToExport,
  getAllAvaibleTaskStatus,
  getActiveTask,
})
