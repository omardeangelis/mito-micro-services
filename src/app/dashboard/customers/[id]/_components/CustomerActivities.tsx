import { type Customer } from "@/lib/types/schemas"
import { api } from "@/trpc/server"
import { CustomerAlertCreator } from "./CustomerAlertCreator"
import { CustomerAlertHistory } from "./CustomerAlertHistory"
import { canSetCallback } from "@/lib/domain/contact/status"

type Props = {
  customer: {
    id: Customer["id"]
    /** The customer's operator, which can differ from the contact's (D2, A1). */
    operatorId: Customer["operatorId"]
  }
}

export const CustomerActivities = async (props: Props) => {
  const task = await api.task.getActiveTask.query({
    id: props.customer.id,
  })

  if (!task || task.length === 0) {
    return null
  }
  const { alerts } = await api.task.getActiveAlerts.query({
    alertId: task[0]!.alertId!,
  })
  // "Imposta richiamo" only with an outcome or `nessuno`; the server checks it
  // too (AC46)
  const creatable = canSetCallback(task[0]!.state)

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
          operatorId: task[0]!.operatorId,
        }}
        customerOperatorId={props.customer.operatorId}
        alert={alerts}
        creatable={creatable}
      />
      <p className="mb-2 mt-4 text-sm font-medium text-gray-600">
        Storico {pastAlerts.length > 0 ? `(${pastAlerts.length})` : ""}
      </p>
      <CustomerAlertHistory alerts={pastAlerts} />
    </section>
  )
}
