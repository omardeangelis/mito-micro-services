import { unstable_noStore as noStore } from "next/cache"

import { type ServerPageDefaultProps } from "@/lib/types"
import { CustomersTableSection } from "./_components/CustomerTableSection"
import { Suspense } from "react"
import { CustomerTableLoading } from "./_components/CustomerTableLoading"

export const maxDuration = 60

export default async function CustomersHome(props: ServerPageDefaultProps) {
  const searchParams = await props.searchParams
  noStore()

  return (
    <div className="dashbaord-layout">
      <Suspense fallback={<CustomerTableLoading />}>
        <CustomersTableSection searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
