import { createTRPCRouter } from "../../trpc"
import { createContact, setCallback, bulkHandleTask } from "./POST/index"
import { changeState, setPriority, reassign } from "./PUT/index"
import { resolveAlert } from "./DELETE/index"
import {
  getTasksToExport,
  getCustomerAlerts,
  getTaskById,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
} from "./GET/index"

export const taskRouter = createTRPCRouter({
  getTaskById,
  createContact,
  setCallback,
  changeState,
  setPriority,
  reassign,
  bulkHandleTask,
  resolveAlert,
  getCustomerAlerts,
  getTasksToExport,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
})
