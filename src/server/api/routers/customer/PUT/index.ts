import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { customers } from "@/server/db/schema/customers"
import { eq, inArray, desc } from "drizzle-orm"
import { insertCustomerSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"

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
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx

    const [before] = await db
      .select({ operatorId: customers.operatorId })
      .from(customers)
      .where(eq(customers.id, input.id!))

    const res = await db
      .update(customers)
      .set(input)
      .where(eq(customers.id, input.id!))
      .returning({ id: customers.id })

    if (
      input.operatorId !== undefined &&
      input.operatorId !== before?.operatorId
    ) {
      await db.insert(taskEventLog).values({
        customerId: input.id!,
        actorOperatorId: ctx.operator.id,
        action: "operator_reassign",
        source: "detail",
        fromOperatorId: before?.operatorId ?? null,
        toOperatorId: input.operatorId,
      })
    }

    return res
  })

const bulkAssignCustomerSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
})
export const bulkUpdateCustomers = operatorProcedure
  .input(bulkAssignCustomerSchema)
  .mutation(async ({ input, ctx }) => {
    const { db } = ctx

    const customersBeforeUpdate = await db
      .select({ id: customers.id, operatorId: customers.operatorId })
      .from(customers)
      .where(inArray(customers.id, input.customerIds))

    const updateCustomer = await db
      .update(customers)
      .set({ operatorId: input.operatorId })
      .where(inArray(customers.id, input.customerIds))
      .returning({ id: customers.id })

    const logRows = customersBeforeUpdate
      .filter((c) => c.operatorId !== input.operatorId)
      .map((c) => ({
        customerId: c.id,
        actorOperatorId: ctx.operator.id,
        action: "operator_reassign" as const,
        source: "bulk" as const,
        fromOperatorId: c.operatorId,
        toOperatorId: input.operatorId,
      }))
    if (logRows.length > 0) {
      await db.insert(taskEventLog).values(logRows)
    }

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

    const [before] = await db
      .select({ operatorId: customers.operatorId })
      .from(customers)
      .where(eq(customers.id, input.id))

    const res = await db
      .update(customers)
      .set({ operatorId: operator.id })
      .where(eq(customers.id, input.id))

    if (before?.operatorId !== operator.id) {
      await db.insert(taskEventLog).values({
        customerId: input.id,
        actorOperatorId: operator.id,
        action: "operator_reassign",
        source: "self_assign",
        fromOperatorId: before?.operatorId ?? null,
        toOperatorId: operator.id,
      })
    }

    return res
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
