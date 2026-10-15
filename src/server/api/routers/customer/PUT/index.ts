import { adminProcedure, operatorProcedure } from "@/server/api/trpc"
import { customers } from "@/server/db/schema/customers"
import { eq, inArray, desc } from "drizzle-orm"
import { insertCustomerSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { runTrpc } from "@/server/effect/trpc"
import { actorOf } from "@/server/services/contact/actor"
import {
  assignToYourself as assignToYourselfService,
  handover as handoverService,
} from "@/server/services/customer/assignment"
import { customerErrorToTrpc } from "@/server/services/customer/errors"

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
  sede: true,
  source: true,
})

/**
 * Saves the customer's master data from the form. The operator changes only
 * through `handover` (D13): an `operatorId` in the request is dropped.
 */
export const updateCustomerFromDashboard = operatorProcedure
  .input(updateCustomerFromDashboardSchema)
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx
    return await db
      .update(customers)
      .set(input)
      .where(eq(customers.id, input.id!))
      .returning({ id: customers.id })
  })

const handoverInput = z.object({
  customerId: z.string(),
  toOperatorId: z.number().int(),
})

/** "Passaggio di consegne" (D13): see the `handover` service. */
export const handover = operatorProcedure
  .input(handoverInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      handoverService({
        customerId: input.customerId,
        toOperatorId: input.toOperatorId,
        actor: actorOf(ctx.operator),
      }),
      customerErrorToTrpc
    )
  )

const bulkAssignCustomerSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
})
export const bulkUpdateCustomers = adminProcedure
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

    // Without a WHERE the update would reach every task in the table
    if (taskIds.length > 0) {
      await ctx.db
        .update(task)
        .set({ operatorId: input.operatorId })
        .where(inArray(task.id, taskIds as number[]))
    }

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

/** "Assegna a te" (P4): see the `assignToYourself` service. */
export const assignToYourself = operatorProcedure
  .input(z.object({ id: z.string() }))
  .mutation(({ ctx, input }) =>
    runTrpc(
      assignToYourselfService({
        customerId: input.id,
        actor: actorOf(ctx.operator),
      }),
      customerErrorToTrpc
    )
  )

const updateLastEditInput = insertCustomerSchema.pick({
  id: true,
})

export const updateLastEdit = operatorProcedure
  .input(updateLastEditInput)
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx
    return updateCustomerUpdatedAt({ id: input.id!, db })
  })
