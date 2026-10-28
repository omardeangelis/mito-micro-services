import { useRef } from "react"
import { useParams } from "react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { useCustomer } from "@/api/customer"
import { useActiveTask, useContactDetail, useCustomerAlerts } from "@/api/task"
import { CustomerChatSection } from "@/components/custom/notes/CustomerChatSection"
import { CustomerSheet } from "./detail/_components/CustomerSheet"
import { CustomerPraticaSection } from "./detail/_components/CustomersPraticaSection"
import { CustomerFormSection } from "./detail/_components/CustomerFormSection"
import { CustomerContactSummary } from "./detail/_components/CustomerContactSummary"
import { CustomerCreateContact } from "./detail/_components/CustomerCreateContact"
import type { HandoverActiveContact } from "./detail/_components/CustomerHandoverDialog"
import { type Customer } from "@mito/contract/customer"
import { type ContactDetail, type Task } from "@mito/contract/task"

/**
 * The customer sheet (`/dashboard/customers/:id`), as `customers/[id]/page.tsx`
 * of the Next.js app: the master data, the active contact (its summary, or
 * "Crea contatto"), the practices and the notes. The sheet waits for what
 * the server page read before rendering
 */
export function Component() {
  const { id = "" } = useParams()
  const customer = useCustomer(id)
  const customerTasks = useActiveTask(id)
  const task = customerTasks.data?.[0]
  // What the handover modal says about the active contact: its open alert is
  // the alert of the task that is not resolved yet
  const alerts = useCustomerAlerts(id, {
    enabled: task !== undefined && task.alertId !== null,
  })
  // The summary of the active contact is read-only (AC64, AC65): the contact
  // is read the way its detail reads it, with its operator and open alert
  const activeContactDetail = useContactDetail(String(task?.id ?? ""), {
    enabled: task !== undefined,
  })

  const ready =
    customer.data !== undefined &&
    customerTasks.data !== undefined &&
    (task === undefined ||
      (activeContactDetail.data !== undefined &&
        (task.alertId === null || alerts.data !== undefined)))
  // The last complete view: after a save the page shows it until the new one
  // is complete, as `router.refresh()` kept the page on screen
  const shown = useRef<View | undefined>(undefined)
  if (ready) {
    if (customer.data === null) throw new Error(`Cliente ${id} non trovato`)
    const openAlert = task
      ? alerts.data?.find(
          (alert) => alert.id === task.alertId && !alert.isResolved
        )
      : undefined
    shown.current = {
      customer: customer.data,
      task,
      activeContact: task
        ? {
            state: task.state,
            operatorId: task.operatorId,
            alert: openAlert ? { deadline: openAlert.deadline } : null,
          }
        : null,
      contactDetail: task ? activeContactDetail.data : undefined,
    }
  }
  const view = shown.current?.customer.id === id ? shown.current : undefined
  if (view === undefined) return <Skeleton className="h-80 w-full rounded-md" />
  const { task: activeTask, activeContact, contactDetail } = view

  return (
    <CustomerSheet id={id} blackListStatus={view.customer.blackListStatus}>
      <CustomerFormSection
        customer={view.customer}
        activeContact={activeContact}
      />
      {contactDetail ? (
        <CustomerContactSummary
          customerId={id}
          contact={contactDetail.contact}
          alert={contactDetail.alert}
        />
      ) : (
        <CustomerCreateContact
          customerId={id}
          customerOperatorId={view.customer.operatorId}
        />
      )}
      <CustomerPraticaSection id={id} activeTaskState={activeTask?.state} />
      <CustomerChatSection key={id} customerId={id} />
    </CustomerSheet>
  )
}

type View = {
  customer: Customer
  task: Task | undefined
  activeContact: HandoverActiveContact | null
  contactDetail: ContactDetail | undefined
}
