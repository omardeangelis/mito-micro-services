import { useMemo } from "react"
import { usePracticeList } from "@/api/pratiche"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import { useSearchParams } from "@/lib/navigation"
import { PraticheTableColumns } from "./_components/PracticeColumns"
import { PracticesTable } from "./_components/PracticesTable"
import { practiceListQuery } from "./_lib/listQuery"

/**
 * The practices list (`/dashboard/pratiche`), as `pratiche/page.tsx` of the
 * Next.js app: the page the address asks for, with the skeleton of
 * `loading.tsx` while the first one loads. If the first page fails the route
 * shows its error; a later one leaves the page on screen, with the toast
 */
export function Component() {
  const searchParams = useSearchParams()
  const query = useMemo(() => practiceListQuery(searchParams), [searchParams])
  const { data } = usePracticeList(query)
  // react-table takes a mutable array
  const rows = useMemo(() => data && [...data.data], [data])

  return (
    <section className="dashabord-container">
      <div className="dashbaord-layout">
        {data && rows ? (
          <PracticesTable
            columns={PraticheTableColumns}
            data={rows}
            total={data.total[0]?.total ?? 0}
          />
        ) : (
          <div className="p-4">
            <TableSkeleton rows={10} />
          </div>
        )}
      </div>
    </section>
  )
}
