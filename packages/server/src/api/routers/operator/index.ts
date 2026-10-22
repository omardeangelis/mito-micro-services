import { createTRPCRouter } from "../../trpc"
import {
  getAllUniqueOperators,
  getDeactivationImpact,
  getOperatorById,
  getOperatorsForDeactivation,
  getUserOperator,
  getUserPublicOperator,
} from "./GET/index"
import {
  deactivate,
  updateOperatorInfo,
  updateOperatorsRole,
} from "./PUT/index"

export const operatorRouter = createTRPCRouter({
  deactivate,
  getAllUniqueOperators: getAllUniqueOperators,
  getDeactivationImpact,
  getOperatorById,
  getOperatorsForDeactivation,
  getUserOperator,
  getUserPublicOperator,
  updateOperatorInfo,
  updateOperatorsRole,
})
