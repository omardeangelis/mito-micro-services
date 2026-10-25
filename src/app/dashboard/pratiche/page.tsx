import { unstable_noStore as noStore } from "next/cache"
import { PracticesTable } from "@/app/dashboard/pratiche/_components/PraticesTable"
import { PraticheTableColumns } from "./_components/TableColumn"
import { api } from "@/trpc/server"
import { readRequestPreferences } from "@/lib/preferences/server"
import { type ServerPageDefaultProps } from "@/lib/types"
import { getUrlParmsWithMultipleValue } from "@/lib/utils"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import { parsePraticaSearchBy } from "@mito/domain/constants/praticaSearch"
import { parseFilterParams } from "@mito/domain/filters/advanced"
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
    // Con `q` ripetuto cerca il primo, quello che mostra il badge
    q: Array.isArray(q) ? q[0] : q,
    searchBy: parsePraticaSearchBy(search_by),
    // Ogni tupla dell'URL, come dati: le colonne e gli operatori che non
    // conosce li scarta il server
    advancedFilters: parseFilterParams(filter),
  })

  const preferences = readRequestPreferences()

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
