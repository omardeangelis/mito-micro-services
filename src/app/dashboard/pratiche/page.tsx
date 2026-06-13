import { unstable_noStore as noStore } from "next/cache"
import { PracticesTable } from "@/app/dashboard/pratiche/_components/PraticesTable"
import { PraticheTableColumns } from "./_components/TableColumn"
import { api } from "@/trpc/server"
import { type ServerPageDefaultProps } from "@/lib/types"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@/lib/constants/pagination"
import { createSQLQuery } from "@/lib/utils/filters"
import { PRATICA_FILTER_QUERY_MAP } from "../customers/_constants"
import { getTableName } from "drizzle-orm"
import { practices } from "@/server/db/schema/pratiche"
export default async function ParticheHome({
  searchParams,
}: ServerPageDefaultProps) {
  noStore()
  const {
    page,
    per_page,
    filter_by,
    sorted_by,
    order_by,
    search_by,
    q,
    filter,
  } = searchParams ?? {}

  let sqlQuery = ""
  if (filter)
    sqlQuery = createSQLQuery(
      typeof filter === "string" ? [filter] : filter,
      PRATICA_FILTER_QUERY_MAP,
      getTableName(practices)
    )

  const filterBy = filter_by
    ? getUrlParmsWithMultipleValue(filter_by as string)
    : null

  const sortingObj = {
    orderBy: order_by as string,
    sortedBy: sorted_by as "asc" | "desc" | undefined,
  }

  let obj: Record<string, string | number | undefined> = {}
  if (filterBy) {
    const { map } = filterBy
    obj = Object.fromEntries(map)
    obj.operatore = obj.operatore ? Number(obj.operatore) : undefined
    obj.file = obj.file ?? undefined
  }
  const {
    data,
    total,
    // practicesWithCustomers
  } = await api.pratiche.getAllPratiche.query({
    page: Number(page) || DEFAULT_PAGE,
    perPage: Number(per_page) || DEFAULT_PER_PAGE,
    filterBy: obj,
    orderBy: sortingObj.orderBy ?? "updatedAt",
    sortedBy: sortingObj.sortedBy ?? "asc",
    q: q ? String(q) : undefined,
    searchBy: search_by ? String(search_by) : undefined,
    sqlFilter: sqlQuery,
    filter: filter,
  })

  const { preferences } = await api.user.getUserPreference.query()

  const defaultColumns = preferences?.practicesTableVisibleColumns?.reduce(
    (acc, column) => {
      /* @ts-expect-error columns keys are validColumnKeys */
      acc[column] = false
      return acc
    },
    {}
  )

  return (
    <div className="dashbaord-layout">
      <PracticesTable
        columns={PraticheTableColumns}
        // tempResult={practicesWithCustomers}
        data={data}
        total={total[0]?.total ?? 0}
        dafaultColumns={defaultColumns}
      />
    </div>
  )
}
