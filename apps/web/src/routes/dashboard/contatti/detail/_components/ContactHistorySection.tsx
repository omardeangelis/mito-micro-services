import { Link } from "react-router"
import { useId } from "react"

import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { formatDateAsDMY } from "@mito/client/format"
import type { ContactDetail } from "@mito/contract/task"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { useContactSheet } from "./ContactSheet"

type Props = {
  contacts: ContactDetail["customerContacts"]
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
      className="rounded-card border border-border bg-card p-4 shadow-card"
    >
      <h3 id={headingId} className="text-base font-medium">
        Contatti precedenti
      </h3>
      {contacts.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nessun contatto precedente
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Link
                to={detailHrefFromDa(contact.id, da)}
                preventScrollReset
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
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
                    <span className="text-muted-foreground">Non assegnato</span>
                  ) : (
                    operatorDisplayName(contact.operator)
                  )}
                </span>
                {contact.closedAt === null ? null : (
                  <span className="text-muted-foreground">
                    Contattato il {formatDateAsDMY(contact.closedAt)}
                  </span>
                )}
                <span className="text-muted-foreground">
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
