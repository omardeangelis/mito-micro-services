import { z } from "zod"

import { operatorProcedure, protectedProcedure } from "../../../trpc"
import { practices, stateEnum } from "@mito/db/schema/pratiche"
import { eq, count, desc, asc, and, ilike, inArray } from "drizzle-orm"
import { castAsNumber, containsPattern } from "../../utils/index"
import { getProductKey } from "@mito/domain/constants/productMap"
import { operators } from "@mito/db/schema/operators"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { type PgColumn, union } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { type Customer, type Practice } from "@mito/domain/schemas"
import { query } from "../../../../effect/db"
import { runTrpc } from "../../../../effect/trpc"
import { type ResolvedOperator } from "../../../../services/auth/actor"
import {
  type PraticaSearchBy,
  praticaSearchBy,
} from "@mito/domain/constants/praticaSearch"
import { advancedFiltersWhere } from "../../utils/advancedFilters"
import { PRATICA_FILTER_QUERY_MAP } from "@mito/domain/filters/advanced"

export type Result = Record<
  string,
  {
    pratica: Pick<Practice, "praticaId">
    customers: Pick<Customer, "name" | "surname" | "fullName" | "id">[]
  }
>

// Colonna in cui cerca ogni valore di `search_by`
const praticaSearchColumns = {
  praticaId: practices.praticaId,
} satisfies Record<PraticaSearchBy, PgColumn>

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
  // Stringhe libere: una voce non valida si scarta nel server, non rende
  // invalida la richiesta. Senza `.strict()`: il `sqlFilter` e il `filter` di
  // un frontend vecchio si ignorano
  advancedFilters: z
    .array(z.object({ field: z.string(), op: z.string(), value: z.string() }))
    .optional(),
})

export const getAllAvailableRegion = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    const result = await db
      .selectDistinct({
        region: practices.region,
      })
      .from(practices)

    return result
  }
)

type GetAllPraticheInput = z.infer<typeof getAllPraticheInput>

/**
 * Una pagina della lista Pratiche, con il totale delle pratiche che
 * soddisfano i filtri. `total` resta l'array `[{ total }]` della query.
 */
const getAllPratichePage = (
  input: GetAllPraticheInput,
  operator: Pick<ResolvedOperator, "id" | "role">
) =>
  Effect.gen(function* () {
    const { page, perPage, filterBy, sortedBy, orderBy, q, searchBy } = input
    const productCondition = filterBy?.productId
      ? filterBy.productId.split("-").map((p) => getProductKey(p))
      : undefined
    const filterQuery = and(
      filterBy?.state ? eq(practices.state, filterBy.state) : undefined,
      filterBy?.productId
        ? inArray(practices.productId, productCondition as string[])
        : undefined,
      filterBy?.file ? eq(practices.fileName, filterBy.file) : undefined,
      q ? ilike(praticaSearchColumns[searchBy], containsPattern(q)) : undefined,
      filterBy?.onlyMe && operator.role === "OPERATORE"
        ? eq(customers.operatorId, operator.id)
        : undefined,
      advancedFiltersWhere(input.advancedFilters, PRATICA_FILTER_QUERY_MAP)
    )

    const sortedFn = sortedBy === "desc" ? desc : asc

    const order_by = () => {
      switch (orderBy) {
        case "praticaId":
          return practices.praticaId
        case "productId":
          return practices.productId
        case "importoFinanziato":
          return practices.importoFinanziato
        case "importoErogato":
          return practices.importoErogato
        case "dataLiquidazione":
          return practices.dataLiquidazione
        case "stato":
          return practices.state
        case "importoRata":
          return practices.importoRata
        case "rateTotali":
          return practices.rateTotali
        case "ratePagate":
          return practices.ratePagate
        case "updatedAt":
          return practices.updatedAt
        case "operatore":
          return operators.name
        case "createdAt":
          return practices.createdAt
        default:
          return practices.updatedAt
      }
    }

    const total = query((client) =>
      client
        .select({
          total: count(),
        })
        .from(practices)
        .where(filterQuery)
    )

    const data = query((client) => {
      const customersName = client
        .select({
          id: practices.id,
          praticaId: practices.praticaId,
          productId: practices.productId,
          importoFinanziato: castAsNumber(practices.importoFinanziato),
          importoErogato: practices.importoErogato,
          dataLiquidazione: practices.dataLiquidazione,
          stato: practices.state,
          importoRata: practices.importoRata,
          rateTotali: practices.rateTotali,
          ratePagate: practices.ratePagate,
          updatedAt: practices.updatedAt,
          createdAt: practices.createdAt,
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
        .where(filterQuery)

      return union(
        customersName,
        client
          .select({
            id: practices.id,
            praticaId: practices.praticaId,
            productId: practices.productId,
            importoFinanziato: castAsNumber(practices.importoFinanziato),
            importoErogato: practices.importoErogato,
            dataLiquidazione: practices.dataLiquidazione,
            stato: practices.state,
            importoRata: practices.importoRata,
            rateTotali: practices.rateTotali,
            ratePagate: practices.ratePagate,
            updatedAt: practices.updatedAt,
            createdAt: practices.createdAt,
          })
          .from(practices)
          .innerJoin(
            customerToPratica,
            eq(practices.praticaId, customerToPratica.praticaId)
          )
          .innerJoin(customers, eq(customers.id, customerToPratica.customerId))

          .where(filterQuery)
      )
        .limit(perPage)
        .offset((page - 1) * perPage)
        .orderBy(sortedFn(order_by()))
    })

    return yield* Effect.all({ total, data }, { concurrency: "unbounded" })
  })

export const getAllPratiche = operatorProcedure
  .input(getAllPraticheInput)
  .query(({ ctx, input }) => runTrpc(getAllPratichePage(input, ctx.operator)))

export const getPraticaById = protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input, ctx }) => {
    const { db } = ctx
    const result = await db
      .select({
        id: practices.id,
        praticaId: practices.praticaId,
        productId: practices.productId,
        state: practices.state,
        importoFinanziato: practices.importoFinanziato,
        importoErogato: practices.importoErogato,
        dataLiquidazione: practices.dataLiquidazione,
        importoRata: practices.importoRata,
        rateTotali: practices.rateTotali,
        ratePagate: practices.ratePagate,
        chatId: practices.chatId,
        updatedAt: practices.updatedAt,
        desPuntoVendita: practices.desPuntoVendita,
        operator: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
      })
      .from(practices)
      .leftJoin(operators, eq(operators.id, practices.operatorId))
      .where(eq(practices.praticaId, input.id))

    return result[0]
  })

export const getPraticaByPraticaId = protectedProcedure
  .input(z.object({ praticaId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { db } = ctx
    const result = await db
      .select()
      .from(practices)
      .where(eq(practices.praticaId, input.praticaId))

    return result[0]
  })
