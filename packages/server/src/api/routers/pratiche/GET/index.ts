import { z } from "zod"

import { operatorProcedure } from "../../../trpc"
import { type Customer, type Practice } from "@mito/domain/schemas"
import { runTrpc } from "../../../../effect/trpc"
import { getAllPraticheInput } from "@mito/domain/practice/listInput"
import { listPractices } from "../../../../services/practice/list"
import {
  getPracticeById,
  listRegions,
} from "../../../../services/practice/queries"
import { practiceErrorToTrpc } from "../../../../services/practice/errors"

export type Result = Record<
  string,
  {
    pratica: Pick<Practice, "praticaId">
    customers: Pick<Customer, "name" | "surname" | "fullName" | "id">[]
  }
>

export const getAllAvailableRegion = operatorProcedure.query(() =>
  runTrpc(listRegions())
)

export const getAllPratiche = operatorProcedure
  .input(getAllPraticheInput)
  .query(({ ctx, input }) => runTrpc(listPractices(input, ctx.operator)))

export const getPraticaById = operatorProcedure
  .input(z.object({ id: z.string() }))
  .query(({ input }) => runTrpc(getPracticeById(input.id), practiceErrorToTrpc))
