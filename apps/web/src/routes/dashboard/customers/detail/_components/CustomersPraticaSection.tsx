import { Skeleton } from "@/components/ui/skeleton"
import { useCustomerPractices } from "@/api/customer"
import { type TaskStatus } from "@mito/contract/task"
import { CustomerPraticaTable } from "./CustomerPraticaTable"

import { CreatePraticaTooltipButton } from "./CreatePraticaButton"

type CustomerPraticaSectionProps = {
  id: string
  /** The state of the customer's active contact, if it has one */
  activeTaskState: TaskStatus | null | undefined
}

export function CustomerPraticaSection(props: CustomerPraticaSectionProps) {
  const { id } = props
  const { data: pratica } = useCustomerPractices(id)
  const canAddPractice =
    props.activeTaskState === "caricato" || props.activeTaskState === "erogata"
  if (pratica === undefined)
    return <Skeleton className="h-56 w-full rounded-md" />
  if (pratica.length === 0)
    return (
      <div className="rounded-card mt-8 flex items-center justify-between border border-border bg-card p-4">
        <p className="text-muted-foreground">
          Il Cliente non ha ancora nessuna pratica
        </p>
        <CreatePraticaTooltipButton disabled={!canAddPractice} id={id}>
          Aggiungi Pratica
        </CreatePraticaTooltipButton>
      </div>
    )
  return (
    <div className="rounded-card mt-8 space-y-4 border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Pratiche Cliente</h2>
        <CreatePraticaTooltipButton disabled={!canAddPractice} id={id}>
          Aggiungi Pratica
        </CreatePraticaTooltipButton>
      </div>
      <CustomerPraticaTable pratica={[...pratica]} />
    </div>
  )
}
