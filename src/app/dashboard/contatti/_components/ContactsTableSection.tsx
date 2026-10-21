import { unstable_noStore as noStore } from "next/cache"

import { type SearchParams } from "@/lib/types"
import { api } from "@/trpc/server"
import { parse, toContactsInput } from "../_lib/searchParams"
import { ContactFilters } from "./ContactFilters"
import { ContactsListShell } from "./ContactsListShell"
import { ContactsTable } from "./ContactsTable"
import { HiddenColumnsProvider } from "./hiddenColumns"

export async function ContactsTableSection({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  noStore()
  const state = parse(searchParams)

  const [
    { contacts, previous, total, customerFilter },
    { preferences },
    operators,
  ] = await Promise.all([
    api.task.getContacts.query(toContactsInput(state)),
    api.user.getUserPreference.query(),
    api.operator.getAllUniqueOperators.query(),
  ])

  const hiddenColumns = preferences?.contactTableVisibleColumns ?? []

  return (
    <ContactsListShell>
      <HiddenColumnsProvider initial={hiddenColumns}>
        <ContactFilters
          state={state}
          // Only what the filter needs: the rest of an operator stays on the server
          operators={operators.map(({ id, name, surname }) => ({
            id,
            name,
            surname,
          }))}
          customerFilter={customerFilter}
        />
        <ContactsTable
          contacts={contacts}
          previous={previous}
          total={total}
          state={state}
          hiddenColumns={hiddenColumns}
          now={new Date()}
          customerFilter={customerFilter}
        />
      </HiddenColumnsProvider>
    </ContactsListShell>
  )
}
