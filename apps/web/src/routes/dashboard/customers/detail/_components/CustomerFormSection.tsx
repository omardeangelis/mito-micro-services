import { Skeleton } from "@/components/ui/skeleton"
import { useActiveOperators } from "@/api/operator"
import { type Customer } from "@mito/contract/customer"
import { CustomerForm } from "./CustomerForm"
import type { HandoverActiveContact } from "./CustomerHandoverDialog"

type Props = {
  customer: Customer
  activeContact: HandoverActiveContact | null
}

export const CustomerFormSection = (props: Props) => {
  const { data: availableOperators } = useActiveOperators()
  if (availableOperators === undefined)
    return <Skeleton className="h-80 w-full rounded-md" />
  return (
    <CustomerForm
      customer={props.customer}
      availableOperators={availableOperators}
      activeContact={props.activeContact}
    />
  )
}
