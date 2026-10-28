import { Link, useLocation } from "react-router"
import { usePracticeCustomers } from "@/api/customer"
import { usePractice } from "@/api/pratiche"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerSection } from "./detail/_components/CustomerSection"
import { PracticeGeneralForm } from "./detail/_components/PracticeGeneralForm"

/**
 * The detail of a practice (`/dashboard/pratiche/:id`, by its `praticaId`),
 * as `pratiche/[id]/page.tsx` of the Next.js app: the general data, whose
 * state changes, and its customers, whose email and phone number change.
 * A practice that doesn't exist says so in the page
 */
export function Component() {
  const id = praticaIdOf(useLocation().pathname)
  const practice = usePractice(id)
  const customers = usePracticeCustomers(id, {
    enabled: practice.data !== undefined,
  })

  if (practice.error?._tag === "PracticeNotFound") return <PracticeNotFound />
  if (practice.data === undefined || customers.data === undefined)
    return (
      <div className="dashbaord-layout">
        <Skeleton className="h-80 w-full rounded-md" />
      </div>
    )

  const intestatario = customers.data.find(
    (c) => c.customerRole === "Intestatario"
  )
  const initialValues = {
    ...practice.data,
    operatorId:
      intestatario?.operatorId ??
      customers.data.find((c) => c.operatorId)?.operatorId ??
      undefined,
    intestatarioFiscalCode:
      intestatario?.fiscalCode ?? intestatario?.vatCode ?? "",
  }

  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content">
          <div className="rounded-lg border border-neutral-200 p-4">
            <PracticeGeneralForm
              key={practice.data.id}
              initialValues={initialValues}
            />
            <hr className="my-8 border border-neutral-100" />

            <CollassableSection key={id} defaultValue={["item-1"]}>
              {customers.data.map((customer) => (
                <CustomerSection key={customer.id} {...customer} />
              ))}
            </CollassableSection>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The `praticaId` of the address, decoded once from its last segment: the
 * param of React Router decodes a `%` escape in the ID itself again
 */
const praticaIdOf = (pathname: string) => {
  const segment = pathname.slice(pathname.lastIndexOf("/") + 1)
  try {
    return decodeURIComponent(segment)
  } catch {
    // A link written by hand with a broken escape: the segment as it is
    return segment
  }
}

/** As the page `notFound()` of the Next.js app shows, inside the dashboard */
function PracticeNotFound() {
  return (
    <div className="dashbaord-layout">
      <div className="flex flex-col items-start gap-2 p-4">
        <h2 className="text-lg font-medium">Pratica non trovata</h2>
        <Link className="text-sm underline" to="/dashboard/pratiche">
          Torna a Pratiche
        </Link>
      </div>
    </div>
  )
}
