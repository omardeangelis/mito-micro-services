import type { ReactNode } from "react"
import Link from "next/link"
import { BlackListBadge } from "@/app/dashboard/customers/_components/BlackListBadge"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { ReadOnlyReason } from "@/components/custom/contact/ReadOnlyReason"
import { buttonVariants } from "@/components/ui/button"
import {
  operatorDisplayName,
  type OperatorRef,
} from "@mito/domain/contact/permissions"
import { formatDateAsDMY } from "@/lib/utils"
import type { GetContactByIdResult } from "@/server/services/contact/getContactById"
import { ContactOperatorControl } from "./ContactOperatorControl"
import { ContactPriorityControl } from "./ContactPriorityControl"
import { ContactStateControl } from "./ContactStateControl"
import { ReadOnlyFocusFlag } from "./ReadOnlyFocusFlag"

/** "Cognome Nome", the parts that exist; never empty, it names a heading. */
const customerNameOf = (customer: GetContactByIdResult["customer"]) =>
  [customer.surname, customer.name]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || "Cliente senza nome"

/** A term and its value; the value is its own element. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium text-neutral-600">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center gap-2 break-words text-sm">
        {children}
      </dd>
    </div>
  )
}

/**
 * The customer and the data of the contact (AC24): the same as the row of the
 * list. The state and the priority are controls when the contact is editable
 * (AC30, AC42); why it can't be edited, if it can't, is shown next to the name
 * (AC51), and they stay the plain badges. The operator is a control for the
 * one who may change it (AC47, AC50), text for anyone else.
 */
export function ContactDetailHeader({
  data,
  da,
  operators,
}: {
  data: GetContactByIdResult
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
  /** Who the contact can be given to: sent only when the user may reassign */
  operators?: readonly OperatorRef[]
}) {
  const { contact, customer, editability } = data
  const { blackListStatus } = customer

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-medium">{customerNameOf(customer)}</h3>
        {blackListStatus === "whitelisted" ? null : (
          <BlackListBadge
            state={blackListStatus}
            role="img"
            aria-label={
              blackListStatus === "blacklisted"
                ? "In blacklist"
                : "Blacklist in revisione"
            }
          />
        )}
        {editability.kind === "editable" ? null : (
          <ReadOnlyReason editability={editability} fit />
        )}
        <Link
          href={`/dashboard/customers/${customer.id}`}
          prefetch={false}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "sm:ml-auto",
          })}
        >
          Apri scheda cliente
        </Link>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Telefono">{customer.phoneNumber ?? ""}</Field>
        <Field label="CF">
          {customer.fiscalCode ?? customer.vatCode ?? ""}
        </Field>
        <Field label="Stato">
          {editability.kind === "editable" ? (
            <ContactStateControl
              taskId={contact.id}
              state={contact.state}
              da={da}
            />
          ) : (
            <>
              <TaskStatusBadge status={contact.state ?? "nessuno"} />
              <ReadOnlyFocusFlag />
            </>
          )}
        </Field>
        <Field label="Priorità">
          {editability.kind === "editable" ? (
            <ContactPriorityControl
              taskId={contact.id}
              priority={contact.priority}
              customPriority={contact.customPriority}
              da={da}
            />
          ) : (
            <>
              <PriorityBadge priority={contact.priority ?? 0} />
              <span>
                {contact.customPriority === true ? "Manuale" : "Automatica"}
              </span>
            </>
          )}
        </Field>
        <Field label="Operatore">
          {data.canReassign && operators ? (
            <ContactOperatorControl
              taskId={contact.id}
              operatorId={contact.operator?.id ?? null}
              operators={operators}
              da={da}
            />
          ) : contact.operator === null ? (
            <span className="text-neutral-600">Non assegnato</span>
          ) : (
            operatorDisplayName(contact.operator)
          )}
        </Field>
        <Field label="Contattato il">
          {contact.closedAt ? formatDateAsDMY(contact.closedAt) : ""}
        </Field>
        <Field label="Creato">{formatDateAsDMY(contact.createdAt)}</Field>
        <Field label="Aggiornato">{formatDateAsDMY(contact.updatedAt)}</Field>
      </dl>
    </div>
  )
}
