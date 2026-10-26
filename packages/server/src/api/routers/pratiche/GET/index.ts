import { z } from "zod"

import { operatorProcedure } from "../../../trpc"
import { stateEnum } from "@mito/db/schema/pratiche"
import { type Customer, type Practice } from "@mito/domain/schemas"
import { runTrpc } from "../../../../effect/trpc"
import { praticaSearchBy } from "@mito/domain/constants/praticaSearch"
import { advancedFilterSchema } from "@mito/domain/filters/advanced"
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

const getAllPraticheInput = z.object({
  page: z.number().int(),
  perPage: z.number().int(),
  orderBy: z.string().optional().default("updatedAt"),
  sortedBy: z
    .union([z.literal("asc"), z.literal("desc")])
    .optional()
    .default("asc"),
  searchBy: praticaSearchBy.optional().default("praticaId"),
  filterBy: z
    .object({
      state: z.enum(stateEnum).optional(),
      productId: z.string().optional(),
      file: z.string().optional(),
      onlyMe: z.boolean().optional(),
    })
    .optional(),
  q: z.string().optional(),
  // Senza `.strict()`: il `sqlFilter` e il `filter` di un frontend vecchio si
  // ignorano
  advancedFilters: z.array(advancedFilterSchema).optional(),
})

export const getAllAvailableRegion = operatorProcedure.query(() =>
  runTrpc(listRegions())
)

export const getAllPratiche = operatorProcedure
  .input(getAllPraticheInput)
  .query(({ ctx, input }) => runTrpc(listPractices(input, ctx.operator)))

export const getPraticaById = operatorProcedure
  .input(z.object({ id: z.string() }))
  .query(({ input }) => runTrpc(getPracticeById(input.id), practiceErrorToTrpc))
