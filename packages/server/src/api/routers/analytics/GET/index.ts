import { adminProcedure, operatorProcedure } from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import {
  financedAverage,
  financedByBranch,
  financedTotal,
} from "../../../../services/analytics/financed"
import { contactProgress } from "../../../../services/analytics/contactProgress"

const timeFrameInput = z.object({
  timeFrame: z.enum(["30d", "90d", "365d"]).optional().default("30d"),
})

export const getFinancedTotal = operatorProcedure
  .input(timeFrameInput)
  .query(({ ctx, input }) =>
    runTrpc(financedTotal({ timeFrame: input.timeFrame, actor: ctx.actor }))
  )

export const getFinancedAverage = operatorProcedure
  .input(timeFrameInput)
  .query(({ ctx, input }) =>
    runTrpc(financedAverage({ timeFrame: input.timeFrame, actor: ctx.actor }))
  )

export const getFinancedByBranch = adminProcedure
  .input(timeFrameInput)
  .query(({ input }) =>
    runTrpc(financedByBranch({ timeFrame: input.timeFrame }))
  )

export const getContactProgress = operatorProcedure.query(({ ctx }) =>
  runTrpc(contactProgress({ actor: ctx.actor }))
)
