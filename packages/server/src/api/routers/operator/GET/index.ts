import { operatorProcedure, protectedProcedure } from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import {
  getOperatorById as getOperatorByIdService,
  getPublicOperator,
  listActiveOperators,
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
