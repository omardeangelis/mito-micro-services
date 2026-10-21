import { createTRPCRouter } from "../../trpc"
import { getUserPreference } from "./GET/getUserPreference"
import {
  updateContactTableVisibleColumns,
  updateCustomerTableVisibleColumns,
  updateDashboardCollapsed,
  updatePracticesTableVisibleColumns,
} from "./PUT/updateUserPreference"

export const userRouter = createTRPCRouter({
  getUserPreference,
  updateContactTableVisibleColumns,
  updateCustomerTableVisibleColumns,
  updateDashboardCollapsed,
  updatePracticesTableVisibleColumns,
})
