import { adminProcedure, operatorProcedure } from "../../../trpc"
import { insertCustomerSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { actorOf } from "../../../../services/contact/actor"
import {
  assignCustomers as assignCustomersService,
  assignToYourself as assignToYourselfService,
  handover as handoverService,
} from "../../../../services/customer/assignment"
import { customerErrorToTrpc } from "../../../../services/customer/errors"
import {
  markCustomerUpdated,
  setBlackListStatus,
  updateCustomerProfile,
} from "../../../../services/customer/profile"

const updateCustomerFromDashboardSchema = insertCustomerSchema
  .pick({
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
  .extend({ id: z.string().min(1) })

/**
 * Saves the customer's master data from the form. The operator changes only
 * through `handover` (D13): an `operatorId` in the request is dropped.
 */
export const updateCustomerFromDashboard = operatorProcedure
  .input(updateCustomerFromDashboardSchema)
  .mutation(({ input }) => runTrpc(updateCustomerProfile(input.id, input)))

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

const handleCustomerBlackListSchema = insertCustomerSchema
  .pick({ blackListStatus: true })
  .required()
  .extend({ id: z.string().min(1) })

export const handleCustomerBlackList = operatorProcedure
  .input(handleCustomerBlackListSchema)
  .mutation(({ input }) =>
    runTrpc(setBlackListStatus(input.id, input.blackListStatus))
  )

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

const updateLastEditInput = z.object({ id: z.string().min(1) })

export const updateLastEdit = operatorProcedure
  .input(updateLastEditInput)
  .mutation(({ input }) => runTrpc(markCustomerUpdated(input.id)))
