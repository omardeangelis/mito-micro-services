import { unstable_noStore as noStore } from "next/cache"

import { type ServerPageDefaultProps } from "@/lib/types"
import { api } from "@/trpc/server"
import { readRequestPreferences } from "@/lib/preferences/server"
import { parse, toContactsInput } from "../_lib/searchParams"
import { ContactFilters } from "./ContactFilters"
import { ContactsListShell } from "./ContactsListShell"
import { ContactsTable } from "./ContactsTable"
import { HiddenColumnsProvider } from "./hiddenColumns"

export async function ContactsTableSection({
  searchParams,
}: Pick<ServerPageDefaultProps, "searchParams">) {
  noStore()
  const state = parse(searchParams)

  const [{ contacts, previous, total, customerFilter }, operators] =
    await Promise.all([
      api.task.getContacts.query(toContactsInput(state)),
      api.operator.getAllUniqueOperators.query(),
    ])
  const preferences = readRequestPreferences()

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
