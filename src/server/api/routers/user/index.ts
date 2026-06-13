import { createTRPCRouter } from "../../trpc"
import { getUserPreference } from "./GET/getUserPreference"
import {
  updateCustomerTableVisibleColumns,
  updateDashboardCollapsed,
  updatePracticesTableVisibleColumns,
} from "./PUT/updateUserPreference"

export const userRouter = createTRPCRouter({
  getUserPreference,
  updateCustomerTableVisibleColumns,
  updateDashboardCollapsed,
  updatePracticesTableVisibleColumns,
})
