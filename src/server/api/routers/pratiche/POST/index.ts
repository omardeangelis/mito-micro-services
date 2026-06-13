import {
  insertCustomerToPraticaSchema,
  insertPracticeSchema,
} from "@/lib/types/schemas"
import { protectedProcedure } from "@/server/api/trpc"
import { practices } from "@/server/db/schema/pratiche"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"

export const insertPratica = protectedProcedure
  .input(insertPracticeSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    const newPratica = await db
      .insert(practices)
      .values(input)
      .returning({ id: practices.praticaId })

    return newPratica[0]
  })

export const connectPraticaAndCustomer = protectedProcedure
  .input(insertCustomerToPraticaSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    await db.insert(customerToPratica).values(input)
  })
