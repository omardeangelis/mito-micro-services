import { z } from "zod"
import { operatorProcedure } from "../../../trpc"
import {
  insertCustomerSchema,
  insertPracticeSchema,
} from "@mito/domain/schemas"
import { runTrpc } from "../../../../effect/trpc"
import { updateCustomerContacts } from "../../../../services/customer/profile"
import { updatePracticeFromDashboard as updatePracticeFromDashboardService } from "../../../../services/practice/writes"

const updatePraticaFromDashboardSchema = insertPracticeSchema
  .pick({ state: true })
  .extend({ id: z.number().int() })

export const updatePraticaFromDashboard = operatorProcedure
  .input(updatePraticaFromDashboardSchema)
  .mutation(({ input }) => {
    const { id, ...values } = input
    return runTrpc(updatePracticeFromDashboardService(id, values))
  })

const updateCustomerPreviewSchema = insertCustomerSchema
  .pick({ email: true, phoneNumber: true })
  .extend({ id: z.string().min(1) })
  .refine(
    (input) => input.email !== undefined || input.phoneNumber !== undefined,
    "Serve almeno uno fra email e telefono"
  )

export const updateCustomerPreview = operatorProcedure
  .input(updateCustomerPreviewSchema)
  .mutation(({ input }) => {
    const { id, ...values } = input
    return runTrpc(updateCustomerContacts(id, values))
  })
