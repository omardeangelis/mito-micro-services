import { type Customer } from "@/lib/types/schemas"
import { api } from "@/trpc/server"
import { CustomerAlertCreator } from "./CustomerAlertCreator"
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

  return (
    <section className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline gap-1">
        <h2 className="mb-2 text-lg font-medium">Alerts</h2>
        {alerts?.isResolved ? (
          <p className="text-sm italic text-gray-500">
            (Per creare nuovi alert elimina quello scaduto)
          </p>
        ) : null}
      </div>
      <CustomerAlertCreator
        task={{
          id: task[0]!.id,
        }}
        alert={alerts}
        lastAlertId={lastAlertId}
        creatable={creatable}
      />
    </section>
  )
}
