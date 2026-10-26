import { and, asc, countDistinct, desc, eq, ilike, inArray } from "drizzle-orm"
import { type PgColumn, union } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { operators } from "@mito/db/schema/operators"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { customers } from "@mito/db/schema/customers"
import { getProductKey } from "@mito/domain/constants/productMap"
import { type PraticaSearchBy } from "@mito/domain/constants/praticaSearch"
import {
  type AdvancedFilter,
  PRATICA_FILTER_QUERY_MAP,
} from "@mito/domain/filters/advanced"
import { type Practice } from "@mito/domain/schemas"
import { query } from "../../effect/db"
import { advancedFiltersWhere } from "../../shared/advancedFilters"
import { castAsNumber, containsPattern } from "../../shared/sql"
import { type ResolvedOperator } from "../auth/actor"

/**
 * What the practices list reads from the request. The router's input schema
 * (`getAllPraticheInput`) parses into this shape.
 */
export type PracticeListQuery = {
  page: number
  perPage: number
  orderBy: string
  sortedBy: "asc" | "desc"
  searchBy: PraticaSearchBy
  filterBy?: {
    state?: Practice["state"]
    productId?: string
    file?: string
    onlyMe?: boolean
  }
  q?: string
  advancedFilters?: AdvancedFilter[]
}

// Colonna in cui cerca ogni valore di `search_by`
const praticaSearchColumns = {
  praticaId: practices.praticaId,
} satisfies Record<PraticaSearchBy, PgColumn>

/**
 * Una pagina della lista Pratiche, con il totale delle pratiche che
 * soddisfano i filtri, contate una volta ciascuna come le righe di `data`.
 * `total` resta l'array `[{ total }]` della query.
 */
export const listPractices = (
  input: PracticeListQuery,
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
          total: countDistinct(practices.praticaId),
        })
        .from(practices)
        .innerJoin(
          customerToPratica,
          eq(practices.praticaId, customerToPratica.praticaId)
        )
        .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
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
