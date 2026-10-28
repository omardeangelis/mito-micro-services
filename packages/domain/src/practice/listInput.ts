import { z } from "zod"
import { stateEnum } from "@mito/db/schema/pratiche"
import { praticaSearchBy } from "../constants/praticaSearch"
import { advancedFilterSchema } from "../filters/advanced"

/**
 * The input of `getAllPratiche`: one page of the practices list. The
 * `PracticeListQuery` of @mito/contract writes it again, and a test keeps the
 * two the same
 */
export const getAllPraticheInput = z.object({
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
