import { type ServerPageProps } from "@/lib/types"
import { CustomerSheet } from "./_components/CustomerSheet"
import { CustomerPraticaSection } from "./_components/CustomersPraticaSection"
import { Suspense } from "react"
import { CustomerFormSection } from "./_components/CustomerFormSection"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerChatSection } from "@/components/custom/notes/CustomerChatSection"
import { parseChatLimit } from "@/components/custom/notes/chatLimit"
import { api } from "@/trpc/server"
import { CustomerContactSummary } from "./_components/CustomerContactSummary"
import { CustomerCreateContact } from "./_components/CustomerCreateContact"
import type { HandoverActiveContact } from "./_components/CustomerHandoverDialog"

// What the handover modal says about the active contact: its state, operator
// and open alert (the alert of the task that is not resolved yet)
async function getHandoverActiveContact(
  customerId: string,
  task:
    Awaited<ReturnType<typeof api.task.getActiveTask.query>>[number] | undefined
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
  // The `limit` of the customer's chat, read as the contact's detail reads it
  const limit = parseChatLimit(searchParams?.limit)
  const customer = await api.customer.getCustomerById.query({ id: id })
  const customerTasks = await api.task.getActiveTask.query({ id: id })
  const activeContact = await getHandoverActiveContact(id, customerTasks[0])
  // The summary of the active contact is read-only (AC64, AC65): the contact is
  // read the way its detail reads it, with its operator and open alert
  const activeContactDetail = customerTasks[0]
    ? await api.task.getContactById.query({ id: String(customerTasks[0].id) })
    : null

  return (
    <CustomerSheet id={id} blackListStatus={customer!.blackListStatus}>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-md" />}>
        <CustomerFormSection
          customer={customer!}
          activeContact={activeContact}
        />
      </Suspense>
      {activeContactDetail ? (
        <CustomerContactSummary
          customerId={id}
          contact={activeContactDetail.contact}
          alert={activeContactDetail.alert}
        />
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
        <CustomerChatSection customerId={id} limit={limit} />
      </Suspense>
    </CustomerSheet>
  )
}
