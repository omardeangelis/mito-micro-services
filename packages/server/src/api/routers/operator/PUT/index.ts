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

const deactivateInput = z.object({
  operatorId: z.number().int(),
  toOperatorId: z.number().int(),
})

export const deactivate = adminProcedure
  .input(deactivateInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      deactivateOperator({ ...input, actor: ctx.actor }),
      operatorErrorToTrpc
    )
  )
