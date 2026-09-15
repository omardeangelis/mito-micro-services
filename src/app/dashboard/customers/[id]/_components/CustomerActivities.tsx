import { type Customer } from "@/lib/types/schemas"
import { api } from "@/trpc/server"
import { CustomerAlertCreator } from "./CustomerAlertCreator"
import { CustomerAlertHistory } from "./CustomerAlertHistory"
import { getTaskStatusCategory } from "../../_utils"

type Props = {
  customer: {
    id: Customer["id"]
  }
}

export const CustomerActivities = async (props: Props) => {
  const task = await api.task.getActiveTask.query({
    id: props.customer.id,
  })

  if (!task || task.length === 0) {
    return null
  }
  const taskCategory = getTaskStatusCategory(task[0]!.state!)
  const { alerts, lastAlertId } = await api.task.getActiveAlerts.query({
    alertId: task[0]!.alertId!,
  })
  const creatable = taskCategory === "close" || taskCategory === "idle"

  const customerAlerts = await api.task.getCustomerAlerts.query({
    id: props.customer.id,
  })
  const pastAlerts = customerAlerts.filter((a) => a.isResolved)

  return (
    <section className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-medium">Alerts</h2>
      <p className="mb-3 text-sm text-gray-500">
        Imposta una scadenza per ricordarti di richiamare il cliente. Allo
        scadere l&apos;alert si risolve da solo, finisce nello storico e il
        cliente torna tra i follow-up.
      </p>
      <p className="mb-2 text-sm font-medium text-gray-600">Attivo</p>
      <CustomerAlertCreator
        task={{
          id: task[0]!.id,
        }}
        alert={alerts}
        lastAlertId={lastAlertId}
        creatable={creatable}
      />
      <p className="mb-2 mt-4 text-sm font-medium text-gray-600">
        Storico {pastAlerts.length > 0 ? `(${pastAlerts.length})` : ""}
      </p>
      <CustomerAlertHistory alerts={pastAlerts} />
    </section>
  )
}
