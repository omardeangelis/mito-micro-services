import { useMemo } from "react"
import { useCustomerList } from "@/api/customer"
import { useSearchParams } from "@/lib/navigation"
import { CustomerColumns } from "./_components/CustomerColumns"
import { CustomersTable } from "./_components/CustomersTable"
import { CustomerTableLoading } from "./_components/CustomerTableLoading"
import { customerListQuery } from "./_lib/listQuery"

/**
 * The customers list (`/dashboard/customers`), as `customers/page.tsx` of the
 * Next.js app: the page the address asks for, with the skeleton while the
 * first one loads. If the first page fails the route shows its error, as the
 * Next.js app does; a later one leaves the page on screen, with the toast
 */
export function Component() {
  const searchParams = useSearchParams()
  const query = useMemo(() => customerListQuery(searchParams), [searchParams])
  const { data } = useCustomerList(query)
  // react-table takes a mutable array
  const rows = useMemo(() => data && [...data.allCustomers], [data])

  return (
    // The list scrolls under the filters bar (`sticky top-0`, 71 px, more
    // with the chips of the filters: it writes its height in
    // `--filters-height`) and over the pagination (`sticky bottom-0`, 46 px):
    // scrolling to a focused control stops clear of both, with the 4 px of
    // its outline (WCAG 2.4.11), as in Contatti
    <div className="dashbaord-layout scroll-pb-[50px] scroll-pt-[calc(var(--filters-height,71px)+4px)]">
      {data && rows ? (
        <CustomersTable
          columns={CustomerColumns}
          data={rows}
          total={data.total}
        />
      ) : (
        <CustomerTableLoading />
      )}
    </div>
  )
}
