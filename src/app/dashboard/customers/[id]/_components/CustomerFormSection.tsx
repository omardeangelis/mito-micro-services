import { api } from "@/trpc/server"
import { CustomerForm } from "./CustomerForm"
import type { Customer } from "@mito/domain/schemas"
import type { HandoverActiveContact } from "./CustomerHandoverDialog"

type Props = {
  customer: Customer
  activeContact: HandoverActiveContact | null
}

export const CustomerFormSection = async (props: Props) => {
  const availableOperators = await api.operator.getAllUniqueOperators.query()
  return (
    <CustomerForm
      customer={props.customer}
      availableOperators={availableOperators}
      activeContact={props.activeContact}
    />
  )
}
