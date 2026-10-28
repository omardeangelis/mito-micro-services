import { type CustomerListQuery } from "@mito/contract/customer"
import { parseCustomerSearchBy } from "@mito/domain/constants/customerSearch"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { parseFilterParams } from "@mito/domain/filters/advanced"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"
import { REMOVED_CUSTOMER_ORDER_BY } from "../_constants"

const DEFAULT_SORTING = { orderBy: "updatedAt", sortedBy: "desc" } as const

/** The values of a key of `filter_by` joined by "-" (`[sede]=Roma-Milano`) */
const values = (value: string | undefined) =>
  value ? value.split("-") : undefined

/**
 * The page of the customers list that the address asks for, as
 * `CustomersTableSection` of the Next.js app reads its search params
 */
export function customerListQuery(params: URLSearchParams): CustomerListQuery {
  const { map } = getUrlParmsWithMultipleValue(params.get("filter_by"))
  // The state filter moved to Contatti: a saved link that has it opens
  // without it (AC60). The other keys the list doesn't filter on are dropped
  const operatore = Number(map.get("operatore"))
  const filterBy = {
    operatore:
      map.get("operatore") && !Number.isNaN(operatore) ? operatore : undefined,
    sede: values(map.get("sede")),
    ambito: values(map.get("ambito")),
    jobs: values(map.get("jobs")),
    file: map.get("file") ?? undefined,
  }

  // Without a sort, or with one of the columns Clienti no longer has, the
  // list goes back to the last modified first. The direction goes back with
  // it: it belonged to the sort that is gone (AC59, AC60).
  const orderBy = params.get("order_by")
  const sortedBy = params.get("sorted_by")
  const hasRemovedSort = orderBy
    ?.split(",")
    .some((id) => REMOVED_CUSTOMER_ORDER_BY.includes(id))
  const sorting =
    !orderBy || hasRemovedSort
      ? DEFAULT_SORTING
      : {
          orderBy,
          sortedBy: sortedBy === "asc" ? ("asc" as const) : ("desc" as const),
        }

  return {
    page: Number(params.get("page")) || DEFAULT_PAGE,
    perPage: Number(params.get("per_page")) || DEFAULT_PER_PAGE,
    orderBy: sorting.orderBy,
    sortedBy: sorting.sortedBy,
    searchBy: parseCustomerSearchBy(params.getAll("search_by")),
    // Con `q` ripetuto cerca il primo, quello che mostra il badge
    q: params.get("q") ?? undefined,
    filterBy,
    onlyMe: params.get("only_me") === "true",
    showDM: params.get("black_list") === "true",
    // Ogni tupla dell'URL, come dati: le colonne e gli operatori che non
    // conosce (state, closed_at, inventati) li scarta il server
    advancedFilters: parseFilterParams(params.getAll("filter")),
  }
}
