import { useParams, useSearchParams } from "react-router"
import { useAssignableOperators } from "@/api/operator"
import { useContactPage } from "@/api/task"
import { CustomerChatSection } from "@/components/custom/notes/CustomerChatSection"
import { Skeleton } from "@/components/ui/skeleton"
import { ContactDetailContent } from "./detail/_components/ContactDetailContent"
import { ContactNotFound } from "./detail/_components/ContactNotFound"
import { ContactSheet } from "./detail/_components/ContactSheet"

/**
 * The detail of a contact (`/dashboard/contatti/:id`), as the page and the
 * layout of `contatti/(dettaglio)` of the Next.js app: a sheet that stays
 * mounted when the id changes (a reopening, "Vai al contatto attivo"), with
 * the contact and the chat of its customer. The contact on screen stays
 * until the next one is read. A contact that doesn't exist is said inside
 * the sheet (AC26); any other failure goes to the error of the contacts
 */
export function Component() {
  const { id = "" } = useParams()
  const [searchParams] = useSearchParams()
  // The state of the list this detail was opened from (see `detailHref`)
  const values = searchParams.getAll("da")
  const da = values.length === 1 ? values[0] : undefined

  const detail = useContactPage(id)
  const data = detail.data
  // Only the admin changes the operator (AC50): nobody else pays the query
  const canReassign = data?.canReassign === true
  const operators = useAssignableOperators({ enabled: canReassign })

  const content = () => {
    if (detail.error?._tag === "ContactNotFound") {
      return <ContactNotFound da={values.length > 1 ? values : da} />
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
          da={da}
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

  return <ContactSheet>{content()}</ContactSheet>
}
