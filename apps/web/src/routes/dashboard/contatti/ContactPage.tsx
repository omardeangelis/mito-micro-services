import { useParams, useSearchParams } from "react-router"
import { detailHrefFromDa } from "./_lib/detailHrefFromDa"
import { returnHref } from "@mito/client/contact/searchParams"
import { ContactDetail } from "./detail/_components/ContactDetail"

/**
 * The detail of a contact (`/dashboard/contatti/:id`), as the page and the
 * layout of `contatti/(dettaglio)` of the Next.js app: `ContactDetail` with
 * the links of the contacts. The state of the list this detail was opened
 * from is its `da` parameter (see `detailHref`): the close leads back to it,
 * and so do the other contacts it opens. A `da` that is repeated, or hostile,
 * leads to the list without filters.
 */
export function Component() {
  const { id = "" } = useParams()
  const [searchParams] = useSearchParams()
  const values = searchParams.getAll("da")
  const da = values.length === 1 ? values[0] : undefined

  return (
    <ContactDetail
      id={id}
      links={{
        closeHref: returnHref(da),
        closeLabel: "Torna a Contatti",
        detailHref: (contactId) => detailHrefFromDa(contactId, da),
        savesReturnFocus: true,
      }}
    />
  )
}
