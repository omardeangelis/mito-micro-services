import { createTRPCRouter } from "../../trpc"
import {
  getAllUniqueOperators,
  getOperatorById,
  getUserOperator,
  getUserPublicOperator,
} from "./GET/index"
import { updateOperatorInfo, updateOperatorsRole } from "./PUT/index"

export const operatorRouter = createTRPCRouter({
  getAllUniqueOperators: getAllUniqueOperators,
  getOperatorById,
  getUserOperator,
  getUserPublicOperator,
  updateOperatorInfo,
  updateOperatorsRole,
})
