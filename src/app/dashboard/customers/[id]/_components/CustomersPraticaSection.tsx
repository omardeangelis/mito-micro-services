import { api } from "@/trpc/server"
import {
  CustomerPraticaTable,
  type CustomerToPraticaColumn,
} from "./CustomerPraticaTable"

import { CreatePraticaTooltipButton } from "./CreatePraticaButton"

type CustomerPraticaSectionProps = {
  id: string
}

export async function CustomerPraticaSection(
  props: CustomerPraticaSectionProps
) {
  const { id } = props
  const pratica = await api.customer.getAllPraticaByCustomer.query({
    id: id,
  })
  const activeTask = await api.task.getActiveTask.query({ id })
  const canAddPractice =
    activeTask[0]?.state === "caricato" || activeTask[0]?.state === "erogata"
  if (pratica.length === 0)
    return (
      <div className="mt-8 flex items-center justify-between rounded-md border bg-white p-4">
        <p className="text-gray-500">
          Il Cliente non ha ancora nessuna pratica
        </p>
        <CreatePraticaTooltipButton disabled={!canAddPractice} id={id}>
          Aggiungi Pratica
        </CreatePraticaTooltipButton>
      </div>
    )
  return (
    <div className="mt-8 space-y-4 rounded-md border bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Pratiche Cliente</h2>
        <CreatePraticaTooltipButton disabled={!canAddPractice} id={id}>
          Aggiungi Pratica
        </CreatePraticaTooltipButton>
      </div>
      <CustomerPraticaTable pratica={pratica as CustomerToPraticaColumn[]} />
    </div>
  )
}
