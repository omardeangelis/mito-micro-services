import { z } from "zod"

import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { practices, stateEnum } from "@/server/db/schema/pratiche"
import { eq, count, desc, asc, and, ilike, inArray, sql } from "drizzle-orm"
import { castAsNumber } from "../../utils"
import { getProductKey } from "@/lib/constants/productMap"
import { operators } from "@/server/db/schema/operators"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { customers } from "@/server/db/schema/customers"
import { union } from "drizzle-orm/pg-core"
import { type Customer, type Practice } from "@/lib/types/schemas"

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
  searchBy: z.string().optional().default("id"),
  filterBy: z
    .object({
      state: z.enum(stateEnum).optional(),
      productId: z.string().optional(),
      file: z.string().optional(),
      onlyMe: z.boolean().optional(),
    })
    .optional(),
  q: z.string().optional(),
  sqlFilter: z.string().optional(),
  filter: z.union([z.string(), z.array(z.string()), z.undefined()]),
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

export const getAllPratiche = operatorProcedure
  .input(getAllPraticheInput)
  .query(async ({ ctx, input }) => {
    const { operator } = ctx
    const { page, perPage, filterBy, sortedBy, orderBy, q, searchBy } = input
    const { db } = ctx
    const productCondition = filterBy?.productId
      ? filterBy.productId.split("-").map((p) => getProductKey(p))
      : undefined
    const filterQuery = and(
      filterBy?.state ? eq(practices.state, filterBy.state) : undefined,
      filterBy?.productId
        ? inArray(practices.productId, productCondition as string[])
        : undefined,
      filterBy?.file ? eq(practices.fileName, filterBy.file) : undefined,
      q && searchBy
        ? // @ts-expect-error searchBy is a string
          ilike(practices[searchBy as keyof typeof practices], `%${q}%`)
        : undefined,
      filterBy?.onlyMe && operator.role === "OPERATORE"
        ? eq(customers.operatorId, operator.id)
        : undefined,
      input.sqlFilter ? sql.raw(`${input.sqlFilter}`) : undefined
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

    const total = await db
      .select({
        total: count(),
      })
      .from(practices)
      .where(filterQuery)

    const customersName = db
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

    const data = await union(
      customersName,
      db
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

    // const advancedData = await db
    //   .select({
    //     pratica: {
    //       praticaId: practices.praticaId,
    //     },
    //     customer: {
    //       id: customers.id,
    //       name: customers.name,
    //       surname: customers.surname,
    //       fullName: customers.fullName,
    //     },
    //     ctp: customerToPratica,
    //   })
    //   .from(practices)
    //   .leftJoin(
    //     customerToPratica,
    //     eq(practices.praticaId, customerToPratica.praticaId)
    //   )
    //   .leftJoin(customers, eq(customers.id, customerToPratica.customerId))
    //   .where(filterQuery)
    //   .limit(perPage)
    //   .offset((page - 1) * perPage)
    //   .orderBy(sortedFn(order_by()))

    // const advancedDataResult = advancedData.reduce<Result>((acc, curr) => {
    //   if (!acc[curr.pratica.praticaId]) {
    //     acc[curr.pratica.praticaId] = {
    //       pratica: curr.pratica,
    //       customers: [],
    //     }
    //   }
    //   if (curr.customer && acc[curr.pratica.praticaId]) {
    //     acc[curr.pratica.praticaId]!.customers.push(curr.customer)
    //   }
    //   return acc
    // }, {})

    return {
      total,
      data,
      // practicesWithCustomers: advancedDataResult
    }
  })

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
