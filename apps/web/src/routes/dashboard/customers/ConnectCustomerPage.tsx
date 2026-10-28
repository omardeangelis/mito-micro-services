import { useParams } from "react-router"
import NewPraticaForm from "./connect/_components/NewPraticaForm"

/**
 * A new practice of the customer (`/dashboard/customers/:id/connect`), as
 * `customers/[id]/connect/page.tsx` of the Next.js app: the customer is its
 * holder, the form adds the others
 */
export function Component() {
  const { id = "" } = useParams()
  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content bg-background p-0">
          <NewPraticaForm customerID={id} />
        </div>
      </div>
    </div>
  )
}
