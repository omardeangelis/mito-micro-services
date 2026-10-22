import {
  adminProcedure,
  operatorProcedure,
  protectedProcedure,
} from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { deactivationImpact } from "../../../../services/operator/deactivate"
import {
  getOperatorById as getOperatorByIdService,
  getPublicOperator,
  listActiveOperators,
  listDeactivationTargets,
} from "../../../../services/operator/queries"

export const getAllUniqueOperators = protectedProcedure.query(() =>
  runTrpc(listActiveOperators())
)

const getOperatorByIdInput = z.object({
  id: z.number().optional(),
})

export const getOperatorById = protectedProcedure
  .input(getOperatorByIdInput)
  .query(({ input }) => runTrpc(getOperatorByIdService(input.id)))

export const getUserOperator = operatorProcedure.query(async ({ ctx }) => {
  const { operator } = ctx
  return operator
})

export const getUserPublicOperator = protectedProcedure.query(({ ctx }) =>
  runTrpc(getPublicOperator(ctx.session.user.id))
)

const deactivationInput = z.object({
  operatorId: z.number().int(),
})

export const getDeactivationImpact = adminProcedure
  .input(deactivationInput)
  .query(({ input }) => runTrpc(deactivationImpact(input.operatorId)))

export const getOperatorsForDeactivation = adminProcedure
  .input(deactivationInput)
  .query(({ input }) => runTrpc(listDeactivationTargets(input.operatorId)))
