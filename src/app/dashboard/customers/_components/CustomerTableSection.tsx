import { api } from "@/trpc/server"
import { unstable_noStore as noStore } from "next/cache"
import { type ServerPageDefaultProps } from "@/lib/types"
import { CustomersTable } from "./CustomersTable"
import { CustomerColumns } from "./CustomerColumns"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@/lib/constants/pagination"
import { createSQLQuery } from "@/lib/utils/filters"
import {
  CUSTOMER_FILTER_QUERY_MAP,
  REMOVED_CUSTOMER_COLUMN_IDS,
  REMOVED_CUSTOMER_ORDER_BY,
} from "../_constants"
import { getTableName } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { parseCustomerSearchBy } from "@/lib/constants/customerSearch"

const DEFAULT_SORTING = { orderBy: "updatedAt", sortedBy: "desc" } as const

export async function CustomersTableSection({
  searchParams,
}: Pick<ServerPageDefaultProps, "searchParams">) {
  noStore()
  const {
    page,
    per_page,
    search_by,
    filter_by,
    sorted_by,
    order_by,
    q,
    only_me,
    black_list,
    filter,
  } = searchParams ?? {}
  const filterMap = getUrlParmsWithMultipleValue(filter_by as string)
  let sqlQuery = ""

  if (filter) {
    const arrayFilter = typeof filter === "string" ? [filter] : filter
    // The table name makes it drop the filters on columns that are not in the
    // map: the ones Clienti no longer has (state, closed_at) and made-up ones
    sqlQuery = createSQLQuery(
      arrayFilter,
      CUSTOMER_FILTER_QUERY_MAP,
      getTableName(customers)
    )
  }

  let filterObj = {} as Record<string, string | string[] | number | undefined>
  if (filterMap) {
    const { map } = filterMap
    // The state filter moved to Contatti: a saved link that has it opens
    // without it (AC60)
    map.delete("status")
    filterObj = Object.fromEntries(map)
    filterObj.operatore = filterObj.operatore
      ? Number(filterObj.operatore)
      : undefined
    filterObj.sede =
      filterObj.sede && typeof filterObj.sede === "string"
        ? filterObj.sede.split("-")
        : undefined

    filterObj.ambito =
      filterObj.ambito && typeof filterObj.ambito === "string"
        ? filterObj.ambito.split("-")
        : undefined

    filterObj.jobs =
      filterObj.jobs && typeof filterObj.jobs === "string"
        ? filterObj.jobs.split("-")
        : undefined
    filterObj.file = filterObj.file ?? undefined
  }

  // Without a sort, or with one of the columns Clienti no longer has, the
  // list goes back to the last modified first. The direction goes back with
  // it: it belonged to the sort that is gone (AC59, AC60).
  const hasRemovedSort =
    typeof order_by === "string" &&
    order_by.split(",").some((id) => REMOVED_CUSTOMER_ORDER_BY.includes(id))
  const sortingObj =
    !order_by || hasRemovedSort
      ? DEFAULT_SORTING
      : {
          orderBy: order_by as string,
          sortedBy: (sorted_by as "asc" | "desc" | undefined) ?? "desc",
        }

  const { allCustomers, total } = await api.customer.getAllCustomers.query({
    page: Number(page) || DEFAULT_PAGE,
    perPage: Number(per_page) || DEFAULT_PER_PAGE,
    orderBy: sortingObj.orderBy,
    sortedBy: sortingObj.sortedBy,
    searchBy: parseCustomerSearchBy(search_by),
    // Con `q` ripetuto cerca il primo, quello che mostra il badge
    q: Array.isArray(q) ? q[0] : q,
    filterBy: filterObj,
    onlyMe: only_me === "true",
    showDM: black_list === "true",
    sqlFilter: sqlQuery,
  })

  const { preferences } = await api.user.getUserPreference.query()

  // The saved list is the one of the hidden columns: it can still name the
  // ones Clienti no longer has, which hide nothing
  const defaultColumns = preferences?.customerTableVisibleColumns
    ?.filter((column) => !REMOVED_CUSTOMER_COLUMN_IDS.includes(column))
    .reduce((acc, column) => {
      /* @ts-expect-error columns keys are validColumnKeys */
      acc[column] = false
      return acc
    }, {})

  return (
    <CustomersTable
      columns={CustomerColumns}
      data={allCustomers}
      total={total}
      defaultColumns={defaultColumns}
    />
  )
}
