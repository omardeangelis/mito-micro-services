import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { customers } from "@/server/db/schema/customers"
import { eq, inArray, desc } from "drizzle-orm"
import { insertCustomerSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { task } from "@/server/db/schema/task"

export const updateCustomer = protectedProcedure
  .input(insertCustomerSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .update(customers)
      .set(input)
      .where(eq(customers.id, input.id!))
      .returning({ id: customers.id })
  })

const updateCustomerFromDashboardSchema = insertCustomerSchema.pick({
  id: true,
  name: true,
  surname: true,
  email: true,
  phoneNumber: true,
  address: true,
  cap: true,
  comune: true,
  provincia: true,
  birthdayDate: true,
  reddito: true,
  occupazione: true,
  ambitoLavorativo: true,
  operatorId: true,
  sede: true,
  source: true,
})

export const updateCustomerFromDashboard = operatorProcedure
  .input(updateCustomerFromDashboardSchema)
  .mutation(({ ctx, input }) => {
    const { db } = ctx
    return db
      .update(customers)
      .set(input)
      .where(eq(customers.id, input.id!))
      .returning({ id: customers.id })
  })

const bulkAssignCustomerSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
})
export const bulkUpdateCustomers = operatorProcedure
  .input(bulkAssignCustomerSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx

    const updateCustomer = await db
      .update(customers)
      .set({ operatorId: input.operatorId })
      .where(inArray(customers.id, input.customerIds))
      .returning({ id: customers.id })

    const taskPromises = []

    for (const customer of updateCustomer) {
      taskPromises.push(
        ctx.db
          .select()
          .from(task)
          .where(eq(task.customerId, customer.id))
          .orderBy(desc(task.updatedAt))
          .limit(1)
      )
    }

    const tasksToUpdate = await Promise.all(taskPromises)

    const taskIds = tasksToUpdate
      .filter((task) => task[0]?.id && task[0].state === "chiamare")
      .map((task) => task[0]?.id)

    await ctx.db
      .update(task)
      .set({ operatorId: input.operatorId })
      .where(
        taskIds && taskIds.length > 0
          ? inArray(task.id, taskIds as number[])
          : undefined
      )

    return updateCustomer
  })

const handleCustomerBlackListSchema = insertCustomerSchema.pick({
  id: true,
  blackListStatus: true,
})

export const handleCustomerBlackList = operatorProcedure
  .input(handleCustomerBlackListSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx
    return await db
      .update(customers)
      .set({ blackListStatus: input.blackListStatus })
      .where(eq(customers.id, input.id!))
  })

export const assignToYourself = operatorProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const { db, operator } = ctx
    return await db
      .update(customers)
      .set({ operatorId: operator.id })
      .where(eq(customers.id, input.id))
  })

const updateLastEditInput = insertCustomerSchema.pick({
  id: true,
})

export const updateLastEdit = operatorProcedure
  .input(updateLastEditInput)
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx
    return updateCustomerUpdatedAt({ id: input.id!, db })
  })
