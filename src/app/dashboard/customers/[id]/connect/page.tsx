import { unstable_noStore as noStore } from "next/cache"

import { type ServerPageProps } from "@/lib/types"
import { Suspense } from "react"
import NewPraticaForm from "./_components/NewPraticaForm"

export default async function CustomersHome({
  params,
}: ServerPageProps<{ id: string }>) {
  noStore()
  const { id } = params
  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content bg-background p-0">
          <Suspense fallback={<div>...Loading</div>}>
            <NewPraticaForm
              initialValues={{
                customerID: id,
              }}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
