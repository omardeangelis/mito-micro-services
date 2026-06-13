import { api } from "@/trpc/server"
import { NewCustomerForm } from "./_components/NewCustomerForm"

export default async function NewCustomer() {
  const availableOperators = await api.operator.getAllUniqueOperators.query()
  const sedi = await api.customer.getAllAvaliableSede.query()
  const availableSedi = sedi
    .map((region) => region.sede)
    .filter(Boolean) as string[]

  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content">
          <div className="rounded-lg border border-neutral-200 p-4">
            <NewCustomerForm
              availableOperators={availableOperators}
              availableSedi={availableSedi}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
