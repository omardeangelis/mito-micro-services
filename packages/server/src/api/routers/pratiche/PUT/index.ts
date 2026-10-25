import { operatorProcedure } from "../../../trpc"
import {
  insertCustomerSchema,
  insertPracticeSchema,
} from "@mito/domain/schemas"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { updateCustomerContacts } from "../../../../services/customer/profile"
import {
  assignPractices,
  updatePracticeFromDashboard as updatePracticeFromDashboardService,
} from "../../../../services/practice/writes"

const updatePraticaFromDashboardSchema = insertPracticeSchema.pick({
  id: true,
  state: true,
  operatorId: true,
})

export const updatePraticaFromDashboard = operatorProcedure
  .input(updatePraticaFromDashboardSchema)
  .mutation(({ input }) => {
    const { id: _, ...rest } = input
    return runTrpc(updatePracticeFromDashboardService(input.id!, rest))
  })

const updateCustomerPreviewSchema = insertCustomerSchema.pick({
  id: true,
  email: true,
  phoneNumber: true,
})

export const updateCustomerPreview = operatorProcedure
  .input(updateCustomerPreviewSchema)
  .mutation(({ input }) => runTrpc(updateCustomerContacts(input.id!, input)))

const bulkAssignPracticesSchema = z.object({
  operatorId: z.number(),
  practiceIds: z.array(z.string()),
})

export const bulkAssignPractices = operatorProcedure
  .input(bulkAssignPracticesSchema)
  .mutation(({ input }) =>
    runTrpc(assignPractices(input.operatorId, input.practiceIds))
  )
