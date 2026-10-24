import { protectedProcedure } from "../../../trpc"
import { insertCustomerSchema } from "@mito/domain/schemas"
import { runTrpc } from "../../../../effect/trpc"
import { createCustomer } from "../../../../services/customer/profile"

export const insertCustomer = protectedProcedure
  .input(insertCustomerSchema)
  .mutation(({ input }) => runTrpc(createCustomer(input)))
