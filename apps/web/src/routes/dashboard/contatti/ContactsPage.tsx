import { useQuery } from "@tanstack/react-query"
import { useMemo, useRef } from "react"
import { type ContactsPage } from "@mito/contract/task"
import {
  parse,
  serialize,
  toContactsInput,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useRun } from "@/api/ApiProvider"
import { activeOperatorsOptions } from "@/api/operator"
import { routeErrorWhenEmpty } from "@/api/queryClient"
import { useContacts } from "@/api/task"
import { useSearchParams } from "@/lib/navigation"
import { ContactFilters } from "./_components/ContactFilters"
import { ContactsListShell } from "./_components/ContactsListShell"
import { ContactsTable } from "./_components/ContactsTable"
import { ContactTableLoading } from "./_components/ContactTableLoading"
import { HiddenColumnsProvider } from "./_components/hiddenColumns"

/**
 * The query string as Next.js hands it to a page: a repeated parameter is a
 * list, which `parse` reads as absent
 */
const recordOf = (params: URLSearchParams) => {
  const record: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    record[key] = values.length === 1 ? values[0]! : values
  }
  return record
}

/** What the list shows: a page, the address it was read for, and when */
type View = { state: ContactsListState; page: ContactsPage; now: Date }

/**
 * The contacts list (`/dashboard/contatti`), as `contatti/page.tsx` and
 * `ContactsTableSection` of the Next.js app: the page the address asks for,
 * with the operators of the filter, and the skeleton while the first one
 * loads. As the transition of the Next.js app, the list shows the page and
 * the address it had until the page of the new address is read: the
 * controls and the table always speak of the same address. A page that
 * fails shows the error of the route, as `contatti/error.tsx`
 */
export function Component() {
  const searchParams = useSearchParams()
  const address = useMemo(() => parse(recordOf(searchParams)), [searchParams])
  const input = useMemo(() => toContactsInput(address), [address])
  const contacts = useContacts(input)
  const operators = useQuery({
    ...activeOperatorsOptions(useRun()),
    ...routeErrorWhenEmpty,
  })

  // The page of the address, once read: until then the one before stays
  const view = useRef<View | null>(null)
  const { data, isPlaceholderData, dataUpdatedAt } = contacts
  if (data !== undefined && !isPlaceholderData) {
    const shown = view.current
    if (shown?.page !== data || shown.state !== address) {
      view.current = {
        state: address,
        page: data,
        now: new Date(dataUpdatedAt),
      }
    }
  }
  const shown = view.current
  // Only what the filter needs of an operator
  const operatorRefs = useMemo(
    () =>
      operators.data?.map(({ id, name, surname }) => ({ id, name, surname })),
    [operators.data]
  )

  return (
    // `scroll-pb-16`: the bar of the pagination is `sticky bottom-0` and would
    // cover a focused control that is scrolled to the bottom edge (2.4.11)
    <div className="dashbaord-layout scroll-pb-16">
      {shown !== null && operatorRefs !== undefined ? (
        <ContactsListShell
          listPending={isPlaceholderData}
          shownAddress={serialize(shown.state)}
        >
          <HiddenColumnsProvider initial={[]}>
            <ContactFilters
              state={shown.state}
              operators={operatorRefs}
              customerFilter={shown.page.customerFilter}
            />
            <ContactsTable
              contacts={shown.page.contacts}
              previous={shown.page.previous}
              total={shown.page.total}
              state={shown.state}
              hiddenColumns={[]}
              now={shown.now}
              customerFilter={shown.page.customerFilter}
            />
          </HiddenColumnsProvider>
        </ContactsListShell>
      ) : (
        <ContactTableLoading />
      )}
    </div>
  )
}
