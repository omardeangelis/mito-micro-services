import { createTRPCRouter } from "../../trpc"
import {
  getExistingPractices,
  updateExistingPractices,
  getExistingCustomers,
  updateExistingCustomers,
} from "./GET/index"

const importRouter = createTRPCRouter({
  getExistingPractices,
  updateExistingPractices,
  getExistingCustomers,
  updateExistingCustomers,
})

export default importRouter
