import { createTRPCRouter } from "@/server/api/trpc"
import {
  getAllUniqueOperators,
  getOperatorById,
  getUserOperator,
  getUserPublicOperator,
} from "./GET"
import { updateOperatorInfo, updateOperatorsRole } from "./PUT"

export const operatorRouter = createTRPCRouter({
  getAllUniqueOperators: getAllUniqueOperators,
  getOperatorById,
  getUserOperator,
  getUserPublicOperator,
  updateOperatorInfo,
  updateOperatorsRole,
})
