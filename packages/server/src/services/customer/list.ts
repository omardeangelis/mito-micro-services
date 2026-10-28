import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { type CustomerSearchBy } from "@mito/domain/constants/customerSearch"
import {
  type AdvancedFilter,
  CUSTOMER_FILTER_QUERY_MAP,
} from "@mito/domain/filters/advanced"
import { type Db, type DbError, query } from "../../effect/db"
import { advancedFiltersWhere } from "../../shared/advancedFilters"
import { containsPattern } from "../../shared/sql"

/**
 * What the customers list reads from the request. The router's zod schema
 * (`getAllCustomersInput`) parses into this shape, the `CustomerListQuery` of
 * @mito/contract too (with `searchBy` set).
 */
export type CustomerListQuery = {
  page: number
  perPage: number
  searchBy: CustomerSearchBy
  q?: string
  onlyMe?: boolean
  showDM?: boolean
  orderBy?: string
  sortedBy?: "asc" | "desc"
  filterBy?: {
    operatore?: number
    sede?: readonly string[]
    ambito?: readonly string[]
    jobs?: readonly string[]
    file?: string
  }
  advancedFilters?: readonly AdvancedFilter[]
}

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
const customersOrder = ({ orderBy, sortedBy }: CustomerListQuery): SQL[] => {
  const column = orderColumn(orderBy)
  if (!column) return [desc(customers.updatedAt), desc(customers.id)]
  const sortedFn = sortedBy === "desc" ? desc : asc
  return [sql`${column} IS NULL`, sortedFn(column), sortedFn(customers.id)]
}

/**
 * Lists one page of customers, with the total of the customers that match the
 * filters. No join with the task: each customer is a single row. `operatorId`
 * is the caller's operator, used by `onlyMe`.
 */
export const listCustomers = (
  input: CustomerListQuery,
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
