import { PracticeState } from "@mito/contract/customer"
import { type PracticeListQuery } from "@mito/contract/pratiche"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { parsePraticaSearchBy } from "@mito/domain/constants/praticaSearch"
import { parseFilterParams } from "@mito/domain/filters/advanced"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"

/** A positive integer of the address, or `fallback` */
const integer = (value: string | null, fallback: number) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 ? number : fallback
}

/** A value of the address, or none when it's empty */
const nonEmpty = (value: string | null | undefined) =>
  value === "" || value === null ? undefined : value

const isPracticeState = (value: string | undefined): value is PracticeState =>
  (PracticeState.literals as readonly (string | undefined)[]).includes(value)

/**
 * The page of the practices list that the address asks for, as
 * `pratiche/page.tsx` of the Next.js app reads its search params. Where the
 * Next.js app sent a value the server rejects (a state that isn't one, a
 * page that isn't an integer, a sort direction per column), the page fails;
 * here that value counts as absent
 */
export function practiceListQuery(params: URLSearchParams): PracticeListQuery {
  const { map } = getUrlParmsWithMultipleValue(params.get("filter_by"))
  const state = map.get("state")
  const productId = map.get("productId")
  const file = map.get("file")
  const sortedBy = params.get("sorted_by")

  return {
    page: integer(params.get("page"), DEFAULT_PAGE),
    perPage: integer(params.get("per_page"), DEFAULT_PER_PAGE),
    filterBy: {
      state: isPracticeState(state) ? state : undefined,
      productId: nonEmpty(productId),
      file: nonEmpty(file),
    },
    orderBy: nonEmpty(params.get("order_by")) ?? "updatedAt",
    sortedBy: sortedBy === "desc" ? "desc" : "asc",
    // Con `q` ripetuto cerca il primo, quello che mostra il badge
    q: params.get("q") ?? undefined,
    searchBy: parsePraticaSearchBy(params.getAll("search_by")),
    // Ogni tupla dell'URL, come dati: le colonne e gli operatori che non
    // conosce li scarta il server
    advancedFilters: parseFilterParams(params.getAll("filter")),
  }
}
