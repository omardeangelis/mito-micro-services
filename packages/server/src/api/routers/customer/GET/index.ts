import { operatorProcedure, protectedProcedure } from "../../../trpc"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
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
  max,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { operators } from "@mito/db/schema/operators"
import { type SupaBaseDb } from "@mito/db/types"
import { type PgColumn } from "drizzle-orm/pg-core"
import { type Db, type DbError, query } from "../../../../effect/db"
import { runTrpc } from "../../../../effect/trpc"
import {
  type CustomerSearchBy,
  customerSearchBy,
} from "@mito/domain/constants/customerSearch"
import { containsPattern } from "../../utils/index"
import { advancedFiltersWhere } from "../../utils/advancedFilters"
import {
  advancedFilterSchema,
  CUSTOMER_FILTER_QUERY_MAP,
} from "@mito/domain/filters/advanced"

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

// Colonne in cui cerca ogni valore di `search_by`: il codice fiscale cerca
// anche nella partita IVA
const customerSearchColumns = {
  fiscalCode: [customers.fiscalCode, customers.vatCode],
  name: [customers.name],
  surname: [customers.surname],
  email: [customers.email],
  phoneNumber: [customers.phoneNumber],
  comune: [customers.comune],
} satisfies Record<CustomerSearchBy, PgColumn[]>

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

type GetAllCustomersInput = z.infer<typeof getAllCustomersInput>

/** Una riga della lista Clienti: il cliente, il suo operatore e le pratiche. */
type CustomerListRow = Pick<
  typeof customers.$inferSelect,
  | "id"
  | "name"
  | "surname"
  | "fiscalCode"
  | "email"
  | "phoneNumber"
  | "comune"
  | "vatCode"
  | "birthdayDate"
  | "blackListStatus"
  | "sede"
  | "ambitoLavorativo"
  | "occupazione"
  | "createdAt"
  | "updatedAt"
> & {
  operatore: Pick<
    typeof operators.$inferSelect,
    "id" | "name" | "surname"
  > | null
  signedPractices: number
}

// Le pratiche del cliente in una sottoquery: un join con `customerToPratica`
// ripeterebbe il cliente per ogni pratica
const signedPractices = sql<number>`(
  select count(distinct ${customerToPratica.praticaId})
  from ${customerToPratica}
  where ${customerToPratica.customerId} = ${customers.id}
)`.mapWith(Number)

// La colonna di un `orderBy` noto; null per uno sconosciuto o tolto
// (`priority`, `contattato`, `status`). Uno `switch` e non un oggetto, così
// anche `toString` è sconosciuto
const orderColumn = (orderBy: string | undefined): SQLWrapper | null => {
  switch (orderBy) {
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
      return signedPractices
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
    default:
      return null
  }
}

// Il default è l'ultima modifica, dalla più recente, qualunque sia `sortedBy`.
// L'id del cliente chiude ogni ordinamento, nella stessa direzione: con valori
// uguali (un'assegnazione massiva scrive lo stesso updatedAt) le pagine non
// ripetono né saltano clienti
const customersOrder = ({ orderBy, sortedBy }: GetAllCustomersInput): SQL[] => {
  const column = orderColumn(orderBy)
  if (!column) return [desc(customers.updatedAt), desc(customers.id)]
  const sortedFn = sortedBy === "desc" ? desc : asc
  return [sql`${column} IS NULL`, sortedFn(column), sortedFn(customers.id)]
}

/**
 * Una pagina della lista Clienti, con il totale dei clienti che soddisfano i
 * filtri. Senza join con la task: ogni cliente è una riga sola.
 */
const getAllCustomersPage = (
  input: GetAllCustomersInput,
  operatorId: number
): Effect.Effect<
  { allCustomers: CustomerListRow[]; total: number },
  DbError,
  Db
> =>
  Effect.gen(function* () {
    const { searchBy, q } = input

    const operatorFilter = input.onlyMe
      ? operatorId
      : input.filterBy?.operatore
        ? input.filterBy.operatore
        : undefined

    const getSearchedBy = () => {
      if (!q) return undefined
      return or(
        ...customerSearchColumns[searchBy].map((column) =>
          ilike(column, containsPattern(q))
        )
      )
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
    )

    // Lo stesso `where` per la pagina e per il totale
    const where = and(
      filterQuery,
      advancedFiltersWhere(input.advancedFilters, CUSTOMER_FILTER_QUERY_MAP)
    )

    const allCustomers = query((client) =>
      client
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
          signedPractices,
        })
        .from(customers)
        .leftJoin(operators, eq(customers.operatorId, operators.id))
        .where(where)
        .orderBy(...customersOrder(input))
        .limit(input.perPage)
        .offset((input.page - 1) * input.perPage)
    )

    const total = query((client) =>
      client
        .select({ total: count(customers.id) })
        .from(customers)
        .where(where)
    ).pipe(Effect.map(([row]) => row?.total ?? 0))

    return yield* Effect.all(
      { allCustomers, total },
      { concurrency: "unbounded" }
    )
  })

export const getAllCustomers = operatorProcedure
  .input(getAllCustomersInput)
  .query(({ ctx, input }) =>
    runTrpc(getAllCustomersPage(input, ctx.operator.id))
  )

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
