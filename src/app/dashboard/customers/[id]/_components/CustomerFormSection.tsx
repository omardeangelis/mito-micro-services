import { api } from "@/trpc/server"
import { CustomerForm } from "./CustomerForm"
import type { Customer } from "@/lib/types/schemas"

export const CustomerFormSection = async (props: Customer) => {
  const availableOperators = await api.operator.getAllUniqueOperators.query()
  return (
    <CustomerForm customer={props} availableOperators={availableOperators} />
  )
}
