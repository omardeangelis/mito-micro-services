import { operatorProcedure, protectedProcedure } from "../../../trpc"
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

export const getAmountPerSedeInLastMonth = protectedProcedure
  .input(timeFrameInput)
  .query(({ input }) =>
    runTrpc(financedByBranch({ timeFrame: input.timeFrame }))
  )

export const getAllDoneTasksInLastMonth = operatorProcedure.query(({ ctx }) =>
  runTrpc(contactProgress({ actor: ctx.actor }))
)

export const getFinanziatoMedioPerOperatore = protectedProcedure
  .input(timeFrameInput)
  .query(({ input }) =>
    runTrpc(financedAverage({ timeFrame: input.timeFrame }))
  )

export const getFinanziatoTotalePerOperatore = operatorProcedure
  .input(timeFrameInput)
  .query(({ ctx, input }) =>
    runTrpc(financedTotal({ timeFrame: input.timeFrame, actor: ctx.actor }))
  )

export const getFinaziatoMedioPerCliente = operatorProcedure
  .input(timeFrameInput)
  .query(({ ctx, input }) =>
    runTrpc(financedAverage({ timeFrame: input.timeFrame, actor: ctx.actor }))
  )
