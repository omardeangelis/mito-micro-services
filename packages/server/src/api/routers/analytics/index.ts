import { createTRPCRouter } from "../../trpc"
import {
  getContactProgress,
  getFinancedAverage,
  getFinancedByBranch,
  getFinancedTotal,
} from "./GET/index"
export const analyticsRouter = createTRPCRouter({
  getFinancedTotal,
  getFinancedAverage,
  getFinancedByBranch,
  getContactProgress,
})
