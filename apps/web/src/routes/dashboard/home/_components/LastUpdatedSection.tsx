import { useMemo } from "react"
import { type PracticeListQuery } from "@mito/contract/pratiche"
import { usePracticeList } from "@/api/pratiche"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import { LastUpdatedPracticesColumns } from "./LastUpdatedColumns"
import { LastUpdatedTable } from "./LastUpdatedTable"

/**
 * The 6 practices updated last, of every operator. The Next.js app asked for
 * them without a direction, so the default "asc" showed the 6 updated first
 */
export const LAST_UPDATED: PracticeListQuery = {
  page: 1,
  perPage: 6,
  orderBy: "updatedAt",
  sortedBy: "desc",
  filterBy: { onlyMe: false },
}

export const LastUpdatedSection = () => {
  const { data } = usePracticeList(LAST_UPDATED)
  // react-table takes a mutable array
  const rows = useMemo(() => data && [...data.data], [data])
  if (!rows) return <TableSkeleton rows={5} />
  return <LastUpdatedTable columns={LastUpdatedPracticesColumns} data={rows} />
}
