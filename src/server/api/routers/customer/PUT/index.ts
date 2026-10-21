import { adminProcedure, operatorProcedure } from "@/server/api/trpc"
import { customers } from "@mito/db/schema/customers"
import { eq } from "drizzle-orm"
import { insertCustomerSchema } from "@/lib/types/schemas"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { runTrpc } from "@/server/effect/trpc"
import { actorOf } from "@/server/services/contact/actor"
import {
  assignCustomers as assignCustomersService,
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

/** "Assegna Clienti" (AC75, P19): see the `assignCustomers` service. */
export const bulkUpdateCustomers = adminProcedure
  .input(bulkAssignCustomerSchema)
  .mutation(({ input, ctx }) =>
    runTrpc(
      assignCustomersService({
        customerIds: input.customerIds,
        toOperatorId: input.operatorId,
        actor: actorOf(ctx.operator),
      }),
      customerErrorToTrpc
    )
  )

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
