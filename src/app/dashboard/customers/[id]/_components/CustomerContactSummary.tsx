import type { ReactNode } from "react"
import Link from "next/link"
import {
  customerContactsState,
  detailHref,
} from "@mito/client/contact/searchParams"
import { priorityLabels } from "@/app/dashboard/contatti/_lib/priorityLabels"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { buttonVariants } from "@/components/ui/button"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { bandOf } from "@mito/domain/contact/priority"
import { formatDateAsDMY } from "@/lib/utils"
import type { GetContactByIdResult } from "@mito/server/services/contact/getContactById"

type CustomerContactSummaryProps = {
  customerId: string
  contact: Pick<
    GetContactByIdResult["contact"],
    "id" | "state" | "priority" | "operator"
  >
  /** The open alert of the contact, if it has one. */
  alert: Pick<NonNullable<GetContactByIdResult["alert"]>, "deadline"> | null
}

/** A term and its value; the value is its own element. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-sm">
        {children}
      </dd>
    </div>
  )
}

/**
 * The customer's active contact, read-only (AC64): its state, operator,
 * priority and next alert, and the link to its detail in Contatti, where all of
 * them are changed (AC65). The link opens the detail with the list filtered on
 * this customer (D28), so closing the detail leads back to "Contatti di
 * <cliente>". It carries the attribute "Crea contatto" looks for to hand the
 * focus over (`MANAGE_LINK_SELECTOR`).
 */
export const CustomerContactSummary = (props: CustomerContactSummaryProps) => {
  const { contact, alert } = props
  const priority = contact.priority ?? 0

  return (
    <div className="mt-8 rounded-md border bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-medium">Stato del cliente</h2>
        <Link
          href={detailHref(contact.id, customerContactsState(props.customerId))}
          prefetch={false}
          data-contact-manage-link=""
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Gestisci contatto
        </Link>
      </div>
      <dl className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">
        <Field label="Stato">
          <TaskStatusBadge status={contact.state ?? "nessuno"} />
        </Field>
        <Field label="Operatore">
          {contact.operator === null ? (
            <span className="text-neutral-600">Non assegnato</span>
          ) : (
            operatorDisplayName(contact.operator)
          )}
        </Field>
        <Field label="Priorità">
          <PriorityBadge priority={priority} />
          <span>{priorityLabels[bandOf(priority)]}</span>
        </Field>
        <Field label="Prossimo alert">
          {alert === null ? (
            <span className="text-neutral-600">Nessun alert</span>
          ) : (
            formatDateAsDMY(alert.deadline)
          )}
        </Field>
      </dl>
    </div>
  )
}
