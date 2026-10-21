import { protectedProcedure } from "../../../trpc"
import { customers } from "@mito/db/schema/customers"
import { insertCustomerSchema } from "@mito/domain/schemas"

export const insertCustomer = protectedProcedure
  .input(insertCustomerSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .insert(customers)
      .values(input)
      .returning({ id: customers.id })
  })
