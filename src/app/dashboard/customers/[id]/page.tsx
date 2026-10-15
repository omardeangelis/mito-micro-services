import { type ServerPageProps } from "@/lib/types"
import { CustomerSheet } from "./_components/CustomerSheet"
import { CustomerPraticaSection } from "./_components/CustomersPraticaSection"
import { Suspense } from "react"
import { CustomerFormSection } from "./_components/CustomerFormSection"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerChatSection } from "./_components/CustomerChatSection"
import { api } from "@/trpc/server"
import { CustomerActivities } from "./_components/CustomerActivities"
import { CustomerTaskManager } from "./_components/CustomerTaskManager"
import { CustomerCreateContact } from "./_components/CustomerCreateContact"
import type { HandoverActiveContact } from "./_components/CustomerHandoverDialog"

// What the handover modal says about the active contact: its state, operator
// and open alert (the alert of the task that is not resolved yet)
async function getHandoverActiveContact(
  customerId: string,
  task:
    | Awaited<ReturnType<typeof api.task.getActiveTask.query>>[number]
    | undefined
): Promise<HandoverActiveContact | null> {
  if (!task) return null
  const alerts =
    task.alertId === null
      ? []
      : await api.task.getCustomerAlerts.query({ id: customerId })
  const openAlert = alerts.find(
    (alert) => alert.id === task.alertId && !alert.isResolved
  )
  return {
    state: task.state,
    operatorId: task.operatorId,
    alert: openAlert ? { deadline: openAlert.deadline } : null,
  }
}

export default async function CustomerHome({
  params,
  searchParams,
}: ServerPageProps<{
  id: string
}>) {
  const { id } = params
  const { limit } = searchParams ?? {}
  const customer = await api.customer.getCustomerById.query({ id: id })
  const customerTasks = await api.task.getActiveTask.query({ id: id })
  const activeContact = await getHandoverActiveContact(id, customerTasks[0])

  return (
    <CustomerSheet id={id} blackListStatus={customer!.blackListStatus}>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerFormSection
          customer={customer!}
          activeContact={activeContact}
        />
      </Suspense>
      {customerTasks.length > 0 ? (
        <Suspense>
          <CustomerTaskManager
            tasks={customerTasks}
            customerOperatorId={customer!.operatorId}
          />
        </Suspense>
      ) : (
        <CustomerCreateContact
          customerId={id}
          customerOperatorId={customer!.operatorId}
        />
      )}
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-md" />}>
        <CustomerPraticaSection id={id} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerChatSection
          id={id}
          limit={limit ? Number(limit) : undefined}
        />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerActivities
          customer={{ id, operatorId: customer!.operatorId }}
        />
      </Suspense>
    </CustomerSheet>
  )
}
