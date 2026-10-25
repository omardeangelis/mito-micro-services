import { createTRPCRouter } from "../../trpc"
import { createContact, setCallback, bulkHandleTask } from "./POST/index"
import { changeState, setPriority, reassign } from "./PUT/index"
import { resolveAlert } from "./DELETE/index"
import {
  getCustomerAlerts,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
} from "./GET/index"

export const taskRouter = createTRPCRouter({
  createContact,
  setCallback,
  changeState,
  setPriority,
  reassign,
  bulkHandleTask,
  resolveAlert,
  getCustomerAlerts,
  getActiveTask,
  getCustomersWithActiveAlerts,
  getContacts,
  getContactById,
})
