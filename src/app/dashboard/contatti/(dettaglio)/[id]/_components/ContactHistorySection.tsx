"use client"

import Link from "next/link"
import { useId } from "react"

import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { formatDateAsDMY } from "@/lib/utils"
import type { GetContactByIdResult } from "@mito/server/services/contact/getContactById"
import { detailHrefFromDa } from "../../../_lib/detailHrefFromDa"
import { useContactSheet } from "../../_components/ContactSheet"

type Props = {
  contacts: GetContactByIdResult["customerContacts"]
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * The other contacts of the customer, newest first, each a way to that contact
 * (AC80). It is always there, whether the contact is active or concluded: an
 * operator reading a contact wants to know what came before it. The active
 * contact, when this one is concluded, is marked "Attivo".
 */
export function ContactHistorySection({ contacts, da }: Props) {
  const headingId = useId()
  const { focusStateTriggerOnNextMount } = useContactSheet()

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border bg-white p-4 shadow-sm"
    >
      <h3 id={headingId} className="text-base font-medium">
        Contatti precedenti
      </h3>
      {contacts.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          Nessun contatto precedente
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Link
                href={detailHrefFromDa(contact.id, da)}
                prefetch={false}
                scroll={false}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm hover:bg-gray-100"
                onClick={(event) => {
                  // A modified click opens the link elsewhere: this sheet stays
                  // on this contact and must not promise its next one a focus
                  if (
                    event.button !== 0 ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return
                  }
                  focusStateTriggerOnNextMount()
                }}
              >
                <TaskStatusBadge status={contact.state ?? "nessuno"} />
                {contact.isActive ? (
                  <span className="font-medium">Attivo</span>
                ) : null}
                <span>
                  {contact.operator === null ? (
                    <span className="text-neutral-600">Non assegnato</span>
                  ) : (
                    operatorDisplayName(contact.operator)
                  )}
                </span>
                {contact.closedAt === null ? null : (
                  <span className="text-neutral-600">
                    Contattato il {formatDateAsDMY(contact.closedAt)}
                  </span>
                )}
                <span className="text-neutral-600">
                  Creato il {formatDateAsDMY(contact.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
