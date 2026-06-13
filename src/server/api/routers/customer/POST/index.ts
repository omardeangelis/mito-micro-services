import { protectedProcedure } from "@/server/api/trpc"
import { customers } from "@/server/db/schema/customers"
import { insertCustomerSchema } from "@/lib/types/schemas"

export const insertCustomer = protectedProcedure
  .input(insertCustomerSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .insert(customers)
      .values(input)
      .returning({ id: customers.id })
  })
