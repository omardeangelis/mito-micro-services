import { NewCustomerForm } from "./new/_components/NewCustomerForm"

export function Component() {
  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content">
          <div className="rounded-lg border border-neutral-200 p-4">
            <NewCustomerForm />
          </div>
        </div>
      </div>
    </div>
  )
}
