import { unstable_noStore as noStore } from "next/cache"

import { readContactError } from "@mito/domain/contact/errors"
import { type ServerPageProps } from "@/lib/types"
import { api } from "@/trpc/server"
import { parseChatLimit } from "../../_lib/chatLimit"
import { ContactDetailContent } from "./_components/ContactDetailContent"
import { ContactNotes } from "./_components/ContactNotes"
import { ContactNotFound } from "./_components/ContactNotFound"

export default async function ContactDetailPage({
  params,
  searchParams,
}: ServerPageProps<{ id: string }>) {
  noStore()

  // The state of the list this detail was opened from (see `detailHref`)
  const da = searchParams?.da
  // The `limit` of the customer's chat below the contact
  const limit = parseChatLimit(searchParams?.limit)

  // A plain `await`, no Suspense: the sheet above stays mounted when the id
  // changes, and the content is replaced once the new one is ready
  try {
    const data = await api.task.getContactById.query({ id: params.id })
    // Only the admin changes the operator (AC50): nobody else pays the query
    const operators = data.canReassign
      ? (await api.operator.getAllUniqueOperators.query()).map(
          ({ id, name, surname }) => ({ id, name, surname })
        )
      : undefined
    return (
      <>
        <ContactDetailContent
          data={data}
          da={typeof da === "string" ? da : undefined}
          operators={operators}
        />
        <ContactNotes customerId={data.customer.id} limit={limit} />
      </>
    )
  } catch (error) {
    // Inside the sheet, not `notFound()`: the reader keeps the way back (AC26).
    // Any other error goes to the `error.tsx` of the list.
    if (readContactError(error)?.code === "CONTACT_NOT_FOUND") {
      return <ContactNotFound da={da} />
    }
    throw error
  }
}
