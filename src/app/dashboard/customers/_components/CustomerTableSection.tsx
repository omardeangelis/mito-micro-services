import { api } from "@/trpc/server"
import { unstable_noStore as noStore } from "next/cache"
import { type ServerPageDefaultProps } from "@/lib/types"
import { CustomersTable } from "./CustomersTable"
import { CustomerColumns } from "./CustomerColumns"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@/lib/constants/pagination"
import { createSQLQuery } from "@/lib/utils/filters"
import { CUSTOMER_FILTER_QUERY_MAP } from "../_constants"
import { getTableName } from "drizzle-orm"
import { task } from "@/server/db/schema/task"

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
  let stateSqlQuery = ""

  if (filter) {
    const arrayFilter = typeof filter === "string" ? [filter] : filter
    sqlQuery = createSQLQuery(arrayFilter, CUSTOMER_FILTER_QUERY_MAP)
    stateSqlQuery = createSQLQuery(
      arrayFilter,
      CUSTOMER_FILTER_QUERY_MAP,
      getTableName(task)
    )
  }

  let filterObj = {} as Record<string, string | string[] | number | undefined>
  if (filterMap) {
    const { map } = filterMap
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
    filterObj.status =
      filterObj.status && typeof filterObj.status === "string"
        ? filterObj.status.split("-")
        : undefined
  }

  const sortingObj = {
    orderBy: order_by as string,
    sortedBy: sorted_by as "asc" | "desc" | undefined,
  }

  const { allCustomers, total } = await api.customer.getAllCustomers.query({
    page: Number(page) || DEFAULT_PAGE,
    perPage: Number(per_page) || DEFAULT_PER_PAGE,
    orderBy: sortingObj.orderBy ?? "priority",
    sortedBy: sortingObj.sortedBy ?? "desc",
    searchBy: search_by as string | undefined,
    q: q as string | undefined,
    filterBy: filterObj,
    onlyMe: only_me === "true",
    showDM: black_list === "true",
    sqlFilter: sqlQuery,
    sqlTaskFilter: stateSqlQuery,
  })

  const { preferences } = await api.user.getUserPreference.query()

  const defaultColumns = preferences?.customerTableVisibleColumns?.reduce(
    (acc, column) => {
      /* @ts-expect-error columns keys are validColumnKeys */
      acc[column] = false
      return acc
    },
    {}
  )

  return (
    <CustomersTable
      columns={CustomerColumns}
      data={allCustomers}
      total={total}
      defaultColumns={defaultColumns}
    />
  )
}
