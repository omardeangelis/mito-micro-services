import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { type ContactRow, type CustomerFilter } from "@mito/contract/task"
import { groupContacts } from "../_lib/groupContacts"
import {
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import {
  ariaSortOf,
  contactColumns,
  hideableColumnIds,
  type ContactsTableMeta,
} from "./ContactColumns"
import { ContactPagination } from "./ContactPagination"
import { ContactsEmptyState } from "./ContactsEmptyState"
import { useHiddenColumns } from "./hiddenColumns"
import { useContactsNavigation } from "./ContactsListShell"
import { RestoreRowFocus } from "./RestoreRowFocus"
import { RowChangeProvider, type OnRowChanged } from "./rowChange"

const NO_CONTACTS: readonly ContactRow[] = []

type Props = {
  contacts: readonly ContactRow[]
  /**
   * The contacts no longer active of the customers in `contacts`: they are
   * shown under the active one, and are no rows of the list (not in `total`)
   */
  previous?: readonly ContactRow[]
  total: number
  state: ContactsListState
  /** Ids of the columns the operator hid; the ones that can't be hidden are ignored */
  hiddenColumns: readonly string[]
  /** The instant the page was read at: when "today" is for the alerts */
  now: Date
  /** The customer the list is filtered by; null when it isn't */
  customerFilter?: CustomerFilter | null
}

/** "1 contatto", "N contatti" */
const contactsCount = (total: number) =>
  total === 1 ? "1 contatto" : `${total} contatti`

/**
 * The contacts of the list, one row each, in the order the server gave. The
 * order, the page and the way into a contact all live in the address: the table
 * keeps no state of its own, and every move is a navigation of the shell.
 *
 * The one thing it remembers is the contact whose state a row just saved: the
 * filters may take that row away once the page is refreshed, and the status
 * node says it aloud, with the customer's name and the new total (P17).
 */
export function ContactsTable({
  contacts,
  previous = NO_CONTACTS,
  total,
  state,
  hiddenColumns,
  now,
  customerFilter = null,
}: Props) {
  const { pending, navigate } = useContactsNavigation()
  const tableRef = useRef<HTMLTableElement>(null)
  // The row the reader opened; it only matters while that navigation is pending
  const [openedId, setOpenedId] = useState<number | null>(null)
  // The contact a row saved, until the refreshed rows arrive and are compared
  const changed = useRef<{ id: number; customerName: string } | null>(null)
  const [announcement, setAnnouncement] = useState("")
  // The hidden columns: the prop only seeds them, the menu changes them at once
  const [hidden] = useHiddenColumns(hiddenColumns)

  const onRowChanged = useCallback<OnRowChanged>((id, customerName) => {
    changed.current = { id, customerName }
  }, [])

  // The rows or the total changed: the page was refreshed or navigated
  useEffect(() => {
    const saved = changed.current
    changed.current = null
    const left =
      saved !== null && !contacts.some((contact) => contact.id === saved.id)
    setAnnouncement(
      left
        ? `Il contatto di ${saved.customerName} non è più nell'elenco. ${contactsCount(total)}.`
        : ""
    )
  }, [contacts, total])

  const columnVisibility = useMemo<VisibilityState>(
    () =>
      Object.fromEntries(
        hidden
          .filter((id) => (hideableColumnIds as readonly string[]).includes(id))
          .map((id) => [id, false])
      ),
    [hidden]
  )

  // The previous contacts are rows too, under the active one of their customer
  const entries = useMemo(
    () => groupContacts(contacts, previous),
    [contacts, previous]
  )
  const rows = useMemo(() => entries.map(({ contact }) => contact), [entries])
  const nestedIds = useMemo(
    () =>
      new Set(
        entries.filter(({ nested }) => nested).map(({ contact }) => contact.id)
      ),
    [entries]
  )

  const table = useReactTable({
    data: rows,
    columns: contactColumns,
    // What the cells read from the page: see `ContactsTableMeta`
    meta: { state, now, nestedIds } satisfies ContactsTableMeta,
    getCoreRowModel: getCoreRowModel(),
    // The server sorts: the table neither sorts nor keeps a sorting
    manualSorting: true,
    getRowId: (row) => String(row.id),
    state: { columnVisibility },
  })

  return (
    <RowChangeProvider value={onRowChanged}>
      <div className="relative h-[inherit]">
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <div className="dashboard-content">
          <div className="rounded-md border">
            <Table
              ref={tableRef}
              tabIndex={-1}
              // Where the focus goes when the control it was on is gone
              data-contacts-table=""
              aria-label="Contatti"
              className="overflow-hidden"
              aria-busy={pending}
            >
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        aria-sort={ariaSortOf(state, header.column.id)}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const isOpening = pending && openedId === row.original.id
                  const isPrevious = nestedIds.has(row.original.id)

                  return (
                    <TableRow
                      key={row.id}
                      data-contact-id={row.original.id}
                      data-previous={isPrevious ? "" : undefined}
                      // No transition: the highlight of the hovered row and of
                      // the one being opened changes at once (P17)
                      className={cn(
                        "cursor-pointer transition-none hover:bg-gray-100",
                        isOpening && "bg-gray-100",
                        isPrevious && "bg-neutral-50"
                      )}
                      aria-busy={isOpening || undefined}
                      onClick={() => {
                        setOpenedId(row.original.id)
                        navigate(detailHref(row.original.id, state))
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <ContactsEmptyState
              rowCount={contacts.length}
              total={total}
              state={state}
              customerFilter={customerFilter}
            />
          </div>
        </div>
        <div className="sticky bottom-0 left-0 z-10 flex w-full items-center justify-between bg-card px-4 py-2">
          <ContactPagination state={state} total={total} />
        </div>
        {/* After the table: it looks for the row when it mounts */}
        <RestoreRowFocus tableRef={tableRef} />
      </div>
    </RowChangeProvider>
  )
}
