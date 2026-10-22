import { adminProcedure, operatorProcedure } from "../../../trpc"
import { insertOperatorSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { updateOperatorInfo as updateOperatorInfoService } from "../../../../services/operator/profile"
import { deactivateOperator } from "../../../../services/operator/deactivate"
import { operatorErrorToTrpc } from "../../../../services/operator/errors"
import { updateOperatorsRole as updateOperatorsRoleService } from "../../../../services/operator/roles"

const operatorInsertSchema = insertOperatorSchema.pick({
  name: true,
  surname: true,
})

export const updateOperatorInfo = operatorProcedure
  .input(operatorInsertSchema)
  .mutation(async ({ ctx, input }) => {
    const { operator } = ctx
    await runTrpc(updateOperatorInfoService(operator.id, input))
    // The operator of the context, with the values before the update
    return operator
  })

const updateOperatorsRoleInput = z.array(
  z.object({
    id: z.number(),
    role: z.enum(["ADMIN", "OPERATORE"]),
  })
)

export const updateOperatorsRole = adminProcedure
  .input(updateOperatorsRoleInput)
  .mutation(({ input }) =>
    runTrpc(updateOperatorsRoleService(input), operatorErrorToTrpc)
  )

/**
 * An operator id. It is a Postgres `integer`: a larger one fails validation
 * (BAD_REQUEST) instead of the query (a 500).
 */
const operatorIdInput = z.number().int().positive().max(2_147_483_647)

const deactivateInput = z.object({
  operatorId: operatorIdInput,
  toOperatorId: operatorIdInput,
})

export const deactivate = adminProcedure
  .input(deactivateInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      deactivateOperator({ ...input, actor: ctx.actor }),
      operatorErrorToTrpc
    )
  )
