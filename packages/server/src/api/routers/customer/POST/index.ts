import { protectedProcedure } from "../../../trpc"
import { insertCustomerSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { createCustomer } from "../../../../services/customer/profile"

// The database default of `id` is a constant: the caller passes the id
const insertCustomerInput = insertCustomerSchema.extend({
  id: z.string().min(1),
})

export const insertCustomer = protectedProcedure
  .input(insertCustomerInput)
  .mutation(({ input }) => runTrpc(createCustomer(input)))
