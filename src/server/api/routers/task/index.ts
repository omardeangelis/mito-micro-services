import { createTRPCRouter } from "../../trpc"
import { createContact, setCallback, bulkHandleTask } from "./POST"
import { changeState, setPriority, reassign } from "./PUT"
import { resolveAlert } from "./DELETE"
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
  createContact,
  setCallback,
  changeState,
  setPriority,
  reassign,
  bulkHandleTask,
  resolveAlert,
  getActiveAlerts,
  getCustomerAlerts,
  getTasksToExport,
  getAllAvaibleTaskStatus,
  getActiveTask,
  getCustomersWithActiveAlerts,
})
