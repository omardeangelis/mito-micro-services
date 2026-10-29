import { NewCustomerForm } from "./new/_components/NewCustomerForm"

export function Component() {
  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content">
          <div className="rounded-lg border border-border p-4">
            <NewCustomerForm />
          </div>
        </div>
      </div>
    </div>
  )
}
