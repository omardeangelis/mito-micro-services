import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { customers } from "@/server/db/schema/customers"
import {
  count,
  eq,
  inArray,
  ilike,
  desc,
  and,
  asc,
  sql,
  countDistinct,
  or,
  isNull,
} from "drizzle-orm"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { practices } from "@/server/db/schema/pratiche"
import { operators } from "@/server/db/schema/operators"
import { type SupaBaseDb } from "@/lib/types"
import { task, taskStatus } from "@/server/db/schema/task"
import { type Task } from "@/lib/types/schemas"

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
  searchBy: z.string().optional(),
  q: z.string().optional(),
  onlyMe: z.boolean().optional(),
  showDM: z.boolean().optional(),
  orderBy: z.string().optional().default("surname"),
  sortedBy: z.enum(["asc", "desc"]).optional(),
  filterBy: z
    .object({
      operatore: z.number().optional(),
      sede: z.array(z.string()).optional(),
      ambito: z.array(z.string()).optional(),
      jobs: z.array(z.string()).optional(),
      file: z.string().optional(),
      status: z.array(z.enum(taskStatus)).optional(),
    })
    .optional(),
  sqlFilter: z.string().optional(),
  sqlTaskFilter: z.string().optional(),
})

export const getAllCustomers = operatorProcedure
  .input(getAllCustomersInput)
  .query(async ({ ctx, input }) => {
    const { db, operator } = ctx
    const { searchBy, q } = input

    const queryLimit = input.perPage
    const operatorFilter = input.onlyMe
      ? operator.id
      : input.filterBy?.operatore
        ? input.filterBy.operatore
        : undefined

    const getSearchedBy = () => {
      if (!q || !searchBy) return undefined
      if (searchBy === "fiscalCode") {
        return or(
          ilike(customers.fiscalCode, `%${q}%`),
          ilike(customers.vatCode, `%${q}%`)
        )
      } else {
        // @ts-expect-error searchBy is a string
        return ilike(customers[searchBy as keyof typeof customers], `%${q}%`)
      }
    }

    const unassignedFilter = input.filterBy?.operatore === 0

    const filterQuery = and(
      getSearchedBy(),
      input.showDM ? eq(customers.blackListStatus, "blacklisted") : undefined,
      unassignedFilter
        ? isNull(customers.operatorId)
        : operatorFilter
          ? eq(customers.operatorId, operatorFilter)
          : undefined,

      input.filterBy?.sede && input.filterBy.sede.length > 0
        ? inArray(customers.sede, input.filterBy.sede)
        : undefined,
      input.filterBy?.ambito && input.filterBy.ambito.length > 0
        ? inArray(customers.ambitoLavorativo, input.filterBy.ambito)
        : undefined,
      input.filterBy?.jobs && input.filterBy.jobs.length > 0
        ? inArray(customers.occupazione, input.filterBy.jobs)
        : undefined,
      input.filterBy?.file
        ? eq(customers.fileName, input.filterBy.file)
        : undefined
      // input.sqlFilter ? sql.raw(`${input.sqlFilter}`) : undefined
    )

    const sortedFn = input.sortedBy === "desc" ? desc : asc

    const orderBy = () => {
      switch (input.orderBy) {
        case "name":
          return customers.name
        case "surname":
          return customers.surname
        case "fiscalCode":
          return customers.fiscalCode
        case "email":
          return customers.email
        case "phoneNumber":
          return customers.phoneNumber
        case "comune":
          return customers.comune
        case "birthdayDate":
          return customers.birthdayDate
        case "operatore":
          return operators.name
        case "signedPractices":
          return count(customerToPratica.praticaId)
        case "blackListStatus":
          return customers.blackListStatus
        case "sede":
          return customers.sede
        case "ambitoLavorativo":
          return customers.ambitoLavorativo
        case "occupazione":
          return customers.occupazione
        case "createdAt":
          return customers.createdAt
        case "updatedAt":
          return customers.updatedAt
        case "contattato":
          return task.closedAt
        case "priority":
          return task.priority
        default:
          return task.priority
      }
    }

    const allCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        surname: customers.surname,
        fiscalCode: customers.fiscalCode,
        email: customers.email,
        phoneNumber: customers.phoneNumber,
        comune: customers.comune,
        vatCode: customers.vatCode,
        birthdayDate: customers.birthdayDate,
        blackListStatus: customers.blackListStatus,
        sede: customers.sede,
        ambitoLavorativo: customers.ambitoLavorativo,
        occupazione: customers.occupazione,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        operatore: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
        signedPractices: countDistinct(customerToPratica.praticaId),
        closedAt: task.closedAt,
        priority: task.priority,
        taskCustomerId: task.customerId,
      })
      .from(customers)
      .leftJoin(
        customerToPratica,
        eq(customers.id, customerToPratica.customerId)
      )
      .leftJoin(operators, eq(customers.operatorId, operators.id))
      .leftJoin(
        task,
        and(eq(customers.id, task.customerId), eq(task.isActive, true))
      )
      .where(
        and(
          filterQuery,
          input.sqlFilter ? sql.raw(`${input.sqlFilter}`) : undefined,
          input.filterBy?.status && input.filterBy.status.length > 0
            ? inArray(task.state, input.filterBy.status)
            : undefined
          // input.sqlTaskFilter ? sql.raw(`${input.sqlTaskFilter}`) : undefined
        )
      )
      .groupBy(
        customers.id,
        operators.id,
        task.closedAt,
        task.customerId,
        task.priority
      )
      .limit(queryLimit)
      .offset((input.page - 1) * input.perPage)
      .orderBy(sql`${orderBy()} IS NULL`, sortedFn(orderBy()))

    const customersId =
      allCustomers.length > 0 ? allCustomers.map((c) => c.id) : undefined

    const tasks = await db
      .select()
      .from(task)
      .where(
        and(
          customersId ? inArray(task.customerId, customersId ?? []) : undefined,
          input.sqlTaskFilter ? sql.raw(`${input.sqlTaskFilter}`) : undefined,
          input.filterBy?.status && input.filterBy.status.length > 0
            ? inArray(task.state, input.filterBy.status)
            : undefined,
          eq(task.isActive, true)
        )
      )
      .orderBy(task.updatedAt)

    const newCustomers = allCustomers.map((c) => {
      const activeTasks = tasks.filter((t) => t.customerId === c.id).length ?? 0
      const userTasks =
        tasks.filter((t) => t.customerId === c.id)[0] ?? ({} as Task)

      return {
        ...c,
        activeTasks,
        tasks: userTasks,
      }
    })

    const generateUniqueCustomers = (
      duplicatedCustomers: typeof newCustomers
    ) => {
      if (input.orderBy === "contattato") {
        const sortOrder = input.sortedBy === "asc" ? 1 : -1
        return Array.from(
          new Map(
            duplicatedCustomers
              .sort((a, b) =>
                a.tasks.closedAt! > b.tasks.closedAt! ? sortOrder : -sortOrder
              )
              .map((item) => [item.id, item])
          ).values()
        ).slice(0, input.perPage)
      }
      if (input.orderBy === "priority") {
        const sortOrder = input.sortedBy === "asc" ? 1 : -1
        return Array.from(
          new Map(
            duplicatedCustomers
              .sort((a, b) =>
                a.tasks.priority! > b.tasks.priority! ? sortOrder : -sortOrder
              )
              .map((item) => [item.id, item])
          ).values()
        ).slice(0, input.perPage)
      }
      return Array.from(
        new Map(duplicatedCustomers.map((item) => [item.id, item])).values()
      ).slice(0, input.perPage)
    }

    const uniqueCustomers = generateUniqueCustomers(newCustomers)

    const total = await db
      .select({
        total: count(customers.id),
      })
      .from(customers)
      .leftJoin(
        task,
        and(eq(customers.id, task.customerId), eq(task.isActive, true))
      )
      .where(
        and(
          filterQuery,
          input.sqlFilter ? sql.raw(`${input.sqlFilter}`) : undefined,
          input.filterBy?.status && input.filterBy.status.length > 0
            ? inArray(task.state, input.filterBy.status)
            : undefined
        )
      )

    return {
      allCustomers: uniqueCustomers,
      total: total[0]?.total ?? 0,
    }
  })

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
    const fileNames = await db
      .selectDistinctOn([table.fileName], {
        fileName: table.fileName,
        lastImportUpdate: table.lastImportUpdate,
      })
      .from(table)
      .where(
        sql`${table.fileName} IS NOT NULL AND ${table.fileName} != 'Nessuno'`
      )
      .orderBy(table.fileName, desc(table.lastImportUpdate))
      .limit(200)
    // Riordina per data dopo aver ottenuto i distinct (più recenti prima)
    const sortedByDate = fileNames.sort(
      (a, b) => b.lastImportUpdate.getTime() - a.lastImportUpdate.getTime()
    )
    return sortedByDate.map((f) => ({ fileName: f.fileName }))
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
