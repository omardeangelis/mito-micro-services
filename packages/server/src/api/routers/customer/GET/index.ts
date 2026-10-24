import { operatorProcedure, protectedProcedure } from "../../../trpc"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { eq, inArray, desc, sql, countDistinct, or, max } from "drizzle-orm"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { practices } from "@mito/db/schema/pratiche"
import { operators } from "@mito/db/schema/operators"
import { type SupaBaseDb } from "@mito/db/types"
import { runTrpc } from "../../../../effect/trpc"
import { customerSearchBy } from "@mito/domain/constants/customerSearch"
import { advancedFilterSchema } from "@mito/domain/filters/advanced"
import { listCustomers } from "../../../../services/customer/list"

const getCustomerByIdInput = z.object({
  id: z.string().optional(),
})

export const getCustomerById = protectedProcedure
  .input(getCustomerByIdInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const customer = await db
      .select()
      .from(customers)
      .where(input.id ? eq(customers.id, input.id) : undefined)
    return customer[0]
  })

const getCustomerByFiscalCodeInput = z
  .object({
    fiscalCode: z.string().trim(),
    vatCode: z.string().trim(),
    tempID: z.string().optional(),
  })
  .partial()
  .refine(
    (input) => !!input.fiscalCode || !!input.vatCode,
    "Either fiscalCode or vatCode must be provided"
  )

export const getCustomerByFC = async (fiscalCode: string, db: SupaBaseDb) => {
  return await db
    .select()
    .from(customers)
    .where(eq(customers.fiscalCode, fiscalCode))
}

export const getCustomersByFiscalCodeOrVatCode = protectedProcedure
  .input(getCustomerByFiscalCodeInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const getFilterQuery = () => {
      if (input.tempID) {
        return eq(customers.tempID, input.tempID)
      }
      if (input.fiscalCode) {
        return eq(customers.fiscalCode, input.fiscalCode)
      }
      return eq(customers.vatCode, input.vatCode!)
    }
    return await db.select().from(customers).where(getFilterQuery())
  })

const getAllCustomerForPraticaInput = z.object({
  id: z.string(),
})

export const getAllPraticaByCustomer = protectedProcedure
  .input(getAllCustomerForPraticaInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const praticaIDs = await db
      .select({
        id: customerToPratica.praticaId,
        customerRole: customerToPratica.customerRole,
      })
      .from(customerToPratica)
      .where(eq(customerToPratica.customerId, input.id))

    if (praticaIDs.length === 0) {
      return []
    }

    const pratiche = await db
      .select({
        id: practices.id,
        praticaId: practices.praticaId,
        productId: practices.productId,
        state: practices.state,
        dataLiquidazione: practices.dataLiquidazione,
      })
      .from(practices)
      .where(
        inArray(
          practices.praticaId,
          praticaIDs.map((p) => p.id)
        )
      )

    return pratiche.map((p) => ({
      ...p,
      customerRole: praticaIDs.find((pp) => pp.id === p.praticaId)!
        .customerRole,
    }))
  })

export const getAllCustomerForPratica = protectedProcedure
  .input(getAllCustomerForPraticaInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const customersIDs = await db
      .select({
        id: customerToPratica.customerId,
        customerRole: customerToPratica.customerRole,
      })
      .from(customerToPratica)
      .where(eq(customerToPratica.praticaId, input.id))

    if (customersIDs.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No customers found for this pratica",
      })
    }

    const praticaCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        surname: customers.surname,
        email: customers.email,
        fiscalCode: customers.fiscalCode,
        vatCode: customers.vatCode,
        phoneNumber: customers.phoneNumber,
        blackListStatus: customers.blackListStatus,
        operatorId: customers.operatorId,
        operatorName: operators.name,
        operatorSurname: operators.surname,
      })
      .from(customers)
      .leftJoin(operators, eq(customers.operatorId, operators.id))
      .where(
        inArray(
          customers.id,
          customersIDs.map((c) => c.id)
        )
      )

    return praticaCustomers.map((c) => ({
      ...c,
      customerRole: customersIDs.find((cc) => cc.id === c.id)!.customerRole,
    }))
  })

const getAllCustomersInput = z.object({
  page: z.number(),
  perPage: z.number(),
  searchBy: customerSearchBy.optional().default("fiscalCode"),
  q: z.string().optional(),
  onlyMe: z.boolean().optional(),
  showDM: z.boolean().optional(),
  // Senza `orderBy`, o con uno sconosciuto, vale l'ordine di default
  orderBy: z.string().optional(),
  sortedBy: z.enum(["asc", "desc"]).optional(),
  filterBy: z
    .object({
      operatore: z.number().optional(),
      sede: z.array(z.string()).optional(),
      ambito: z.array(z.string()).optional(),
      jobs: z.array(z.string()).optional(),
      file: z.string().optional(),
    })
    .optional(),
  // Senza `.strict()`: il `sqlFilter` di un frontend vecchio si ignora
  advancedFilters: z.array(advancedFilterSchema).optional(),
})

export const getAllCustomers = operatorProcedure
  .input(getAllCustomersInput)
  .query(({ ctx, input }) => runTrpc(listCustomers(input, ctx.operator.id)))

export const getAllAvailableComune = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    return await db
      .selectDistinct({
        comune: customers.comune,
      })
      .from(customers)
      .orderBy(customers.comune)
  }
)

export const getAllAvaliableSede = operatorProcedure.query(async ({ ctx }) => {
  const { db } = ctx
  return await db
    .selectDistinct({
      sede: customers.sede,
    })
    .from(customers)
    .orderBy(customers.sede)
})

export const getAllAvailableAmbito = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    return await db
      .selectDistinct({
        ambito: customers.ambitoLavorativo,
      })
      .from(customers)
      .orderBy(customers.ambitoLavorativo)
  }
)

export const getAllAvailableJobs = operatorProcedure.query(async ({ ctx }) => {
  const { db } = ctx
  return await db
    .selectDistinct({
      job: customers.occupazione,
    })
    .from(customers)
    .orderBy(customers.occupazione)
})

const getAllFileNameInput = z.enum(["customers", "practices"])

export const getAllFileName = protectedProcedure
  .input(getAllFileNameInput)
  .query(async ({ ctx, input }) => {
    const table = input === "customers" ? customers : practices
    const { db } = ctx
    // Nessun LIMIT: l'aggregazione scansiona comunque tutta la tabella, quindi
    // un limite non fa risparmiare nulla lato DB e il payload è irrisorio
    // (~9 KB per 270 nomi). In passato il limite tagliava in ordine alfabetico
    // e faceva sparire dal filtro i file appena caricati.
    const fileNames = await db
      .select({
        fileName: table.fileName,
        lastImportUpdate: max(table.lastImportUpdate),
      })
      .from(table)
      .where(
        sql`${table.fileName} IS NOT NULL AND ${table.fileName} != 'Nessuno'`
      )
      .groupBy(table.fileName)
      .orderBy(desc(max(table.lastImportUpdate)))
    return fileNames.map((f) => ({ fileName: f.fileName }))
  })

export const getCustomerUnderReview = protectedProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    return await db
      .select({
        id: customers.id,
        name: customers.name,
        surname: customers.surname,
        fiscalCode: customers.fiscalCode,
        vatCode: customers.vatCode,
        birthdayDate: customers.birthdayDate,
        blackListStatus: customers.blackListStatus,
        operatore: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
        signedPractices: countDistinct(customerToPratica.praticaId),
      })
      .from(customers)
      .where(
        or(
          eq(customers.blackListStatus, "review"),
          eq(customers.blackListStatus, "blacklisted")
        )
      )
      .leftJoin(
        customerToPratica,
        eq(customers.id, customerToPratica.customerId)
      )
      .leftJoin(operators, eq(customers.operatorId, operators.id))
      .groupBy(customers.id, operators.id)
      .orderBy(customers.updatedAt)
  }
)
