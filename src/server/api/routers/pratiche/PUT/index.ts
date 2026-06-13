import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { practices } from "@/server/db/schema/pratiche"
import { eq, inArray } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import { insertCustomerSchema, insertPracticeSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { updatePracticeUpdatedAt } from "@/server/shared/updateAt"

export const updatePratica = protectedProcedure
  .input(insertPracticeSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .update(practices)
      .set(input)
      .where(eq(practices.id, input.id!))
      .returning({ id: practices.id })
  })

const updatePraticaFromDashboardSchema = insertPracticeSchema.pick({
  id: true,
  state: true,
  operatorId: true,
})

export const updatePraticaFromDashboard = operatorProcedure
  .input(updatePraticaFromDashboardSchema)
  .mutation(async ({ input, ctx }) => {
    const { id: _, ...rest } = input
    const { db } = ctx
    return await db
      .update(practices)
      .set(rest)
      .where(eq(practices.id, input.id!))
      .returning({ id: practices.id })
  })

const updateCustomerPreviewSchema = insertCustomerSchema.pick({
  id: true,
  email: true,
  phoneNumber: true,
})

export const updateCustomerPreview = operatorProcedure
  .input(updateCustomerPreviewSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .update(customers)
      .set(input)
      .where(eq(customers.id, input.id!))
  })

const bulkAssignPracticesSchema = z.object({
  operatorId: z.number(),
  practiceIds: z.array(z.string()),
})

export const bulkAssignPractices = operatorProcedure
  .input(bulkAssignPracticesSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    await db
      .update(practices)
      .set({ operatorId: input.operatorId })
      .where(inArray(practices.praticaId, input.practiceIds))
  })

const updateLastEditInput = insertPracticeSchema.pick({
  praticaId: true,
})

export const updateLastEdit = operatorProcedure
  .input(updateLastEditInput)
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx
    return await updatePracticeUpdatedAt({ id: input.praticaId, db })
  })
