import { operatorProcedure } from "../../../trpc"
import { insertCustomerSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { createCustomer } from "../../../../services/customer/profile"

// The database default of `id` is a constant: the caller passes the id. The
// operator is whoever creates the customer: an `operatorId` in the request is
// dropped
const insertCustomerInput = insertCustomerSchema
  .omit({ operatorId: true })
  .extend({ id: z.string().min(1) })

export const insertCustomer = operatorProcedure
  .input(insertCustomerInput)
  .mutation(({ ctx, input }) =>
    runTrpc(createCustomer({ ...input, operatorId: ctx.operator.id }))
  )
