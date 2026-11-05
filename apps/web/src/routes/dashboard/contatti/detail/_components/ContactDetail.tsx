import { useAssignableOperators } from "@/api/operator"
import { useContactPage } from "@/api/task"
import { CustomerChatSection } from "@/components/custom/notes/CustomerChatSection"
import { Skeleton } from "@/components/ui/skeleton"
import { ContactDetailContent } from "./ContactDetailContent"
import { ContactNotFound } from "./ContactNotFound"
import { ContactSheet, type ContactDetailLinks } from "./ContactSheet"

export type { ContactDetailLinks }

/**
 * The detail of the contact `id`: a sheet that stays mounted when the id
 * changes (a reopening, "Vai al contatto attivo"), with the contact and the
 * chat of its customer. The contact on screen stays until the next one is
 * read. A contact that doesn't exist is said inside the sheet (AC26); any
 * other failure goes to the error of whoever mounts it.
 *
 * It reads nothing from the address: where it leads and how it names the
 * other contacts is `links`, so the route of the contacts and any other page
 * can mount it.
 */
export function ContactDetail({
  id,
  links,
}: {
  /** The id of the contact as the address holds it */
  id: string
  links: ContactDetailLinks
}) {
  const detail = useContactPage(id)
  const data = detail.data
  // Only the admin changes the operator (AC50): nobody else pays the query
  const canReassign = data?.canReassign === true
  const operators = useAssignableOperators({ enabled: canReassign })

  const content = () => {
    if (detail.error?._tag === "ContactNotFound") {
      return (
        <ContactNotFound
          href={links.closeHref}
          label={links.closeLabel}
          replace={links.closeReplaces}
        />
      )
    }
    // The content comes whole, as the page of the Next.js app awaited it
    if (data === undefined || (canReassign && operators.data === undefined)) {
      return <Skeleton className="h-80 w-full rounded-md" />
    }
    return (
      <>
        <ContactDetailContent
          key={data.contact.id}
          data={data}
          operators={
            canReassign
              ? operators.data?.map(({ id, name, surname }) => ({
                  id,
                  name,
                  surname,
                }))
              : undefined
          }
        />
        <CustomerChatSection customerId={data.customer.id} />
      </>
    )
  }

  return (
    <ContactSheet id={id} links={links}>
      {content()}
    </ContactSheet>
  )
}
