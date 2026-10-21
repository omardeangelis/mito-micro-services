import { createTRPCRouter } from "../../trpc"
import { createContact, setCallback, bulkHandleTask } from "./POST"
import { changeState, setPriority, reassign } from "./PUT"
import { resolveAlert } from "./DELETE"
import {
  getTasksToExport,
  getCustomerAlerts,
  getTaskById,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
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
  getCustomerAlerts,
  getTasksToExport,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
})
