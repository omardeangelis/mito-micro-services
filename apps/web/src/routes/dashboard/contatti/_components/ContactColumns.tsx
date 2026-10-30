import { type ColumnDef, type Table } from "@tanstack/react-table"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  CornerDownRight,
} from "lucide-react"
import { Link } from "react-router"

import { BlackListBadge } from "@/routes/dashboard/customers/_components/BlackListBadge"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { Button } from "@/components/ui/button"
import { type ContactsFilters } from "@mito/domain/contact/listInput"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { isDueOrOverdue, isPastDay } from "@mito/domain/contact/time"
import { formatDateAsDMY } from "@mito/client/format"
import { cn } from "@/lib/utils"
import { type ContactRow } from "@mito/contract/task"
import { customerNameOf } from "../_lib/customerName"
import { customerCellId, customerNameId } from "../_lib/ids"
import {
  withFilterChange,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { ContactRowActions } from "./ContactRowActions"
import { ContactRowState } from "./ContactRowState"
import { useContactsNavigation } from "./ContactsListShell"

type OrderBy = ContactsFilters["orderBy"]

/** The columns the operator can hide (AC5), by id. */
export const hideableColumnIds = ["Telefono", "CF"] as const

/** The columns the server sorts by, and the `orderBy` of each (AC13). */
const SORT_KEYS = {
  Cliente: "customer",
  Priorità: "priority",
  "Contattato il": "closedAt",
  "Prossimo alert": "nextAlert",
  Creato: "createdAt",
  Aggiornato: "updatedAt",
} as const satisfies Record<string, OrderBy>

type SortableColumnId = keyof typeof SORT_KEYS

const sortKeyOf = (columnId: string): OrderBy | undefined =>
  Object.hasOwn(SORT_KEYS, columnId)
    ? SORT_KEYS[columnId as SortableColumnId]
    : undefined

/**
 * The `aria-sort` of a column header: the direction on the column the list is
 * sorted by, "none" on the others that can be sorted, nothing on those that
 * can't.
 */
export const ariaSortOf = (
  state: ContactsListState,
  columnId: string
): "ascending" | "descending" | "none" | undefined => {
  const orderBy = sortKeyOf(columnId)
  if (orderBy === undefined) return undefined
  if (orderBy !== state.orderBy) return "none"
  return state.sortedBy === "asc" ? "ascending" : "descending"
}

/**
 * Sorts by the column: the active column flips its direction, any other starts
 * descending, "Cliente" ascending. A new order is a new view, so the page goes
 * back to 1 (AC17).
 */
function SortButton({
  label,
  state,
}: {
  label: SortableColumnId
  state: ContactsListState
}) {
  const { navigateWith } = useContactsNavigation()
  const orderBy = SORT_KEYS[label]
  const isActive = state.orderBy === orderBy
  const sortedBy = isActive
    ? state.sortedBy === "asc"
      ? "desc"
      : "asc"
    : orderBy === "customer"
      ? "asc"
      : "desc"

  return (
    <Button
      type="button"
      variant="ghost"
      // As `SortableHeader`, 26 px so that the focus outline stays inside the
      // header; the label lines up with the cells, the outline stays inside
      // the first column
      size="sm"
      className={cn(
        // The header's 12 px and weight 550 (AC14), as `SortableHeader`; the
        // sorted column is in foreground, the others in muted-foreground
        "font-label -ml-2 gap-1 px-2 text-xs",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() =>
        navigateWith(state, (base) =>
          withFilterChange(base, { orderBy, sortedBy })
        )
      }
    >
      {label}
      {isActive ? (
        state.sortedBy === "asc" ? (
          <ArrowUp className="h-4 w-4" aria-hidden />
        ) : (
          <ArrowDown className="h-4 w-4" aria-hidden />
        )
      ) : null}
    </Button>
  )
}

/**
 * The customer, a link to their page that does not open the contact. The state
 * selector of the row is described by this cell (`customerCellId`).
 */
function CustomerCell({
  contactId,
  customer,
  nested,
}: {
  contactId: number
  customer: ContactRow["customer"]
  /** A previous contact under the active one: the customer is not repeated as a link */
  nested: boolean
}) {
  const { blackListStatus } = customer

  if (nested) {
    return (
      <div
        id={customerCellId(contactId)}
        className="flex min-w-40 items-center gap-2 pl-4 text-muted-foreground"
      >
        <CornerDownRight className="h-4 w-4 shrink-0" aria-hidden />
        <span id={customerNameId(contactId)}>
          <span className="sr-only">Contatto concluso:</span>
          {` ${customerNameOf(customer)}`}
        </span>
      </div>
    )
  }

  return (
    <div
      id={customerCellId(contactId)}
      className="flex min-w-40 items-center gap-2"
    >
      <Link
        id={customerNameId(contactId)}
        to={`/dashboard/customers/${customer.id}`}
        className="font-medium underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {customerNameOf(customer)}
      </Link>
      {blackListStatus === "whitelisted" ? null : (
        <BlackListBadge
          state={blackListStatus}
          role="img"
          aria-label={
            blackListStatus === "blacklisted"
              ? "In blacklist"
              : "Blacklist in revisione"
          }
        />
      )}
    </div>
  )
}

/** The deadline of the open alert, marked in text and icon when it is due. */
function AlertCell({
  alert,
  now,
}: {
  alert: NonNullable<ContactRow["alert"]>
  now: Date
}) {
  const overdue = isPastDay(alert.deadline, now)
  const due = isDueOrOverdue(alert.deadline, now)

  return (
    <span
      title={alert.message ?? undefined}
      className="inline-flex items-center gap-2"
    >
      <span>{formatDateAsDMY(alert.deadline)}</span>
      {due ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            overdue ? "text-destructive-text" : "text-tag-amber-text"
          )}
        >
          {overdue ? (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          ) : (
            <Clock className="h-4 w-4" aria-hidden />
          )}
          <span>{overdue ? "Scaduto" : "Oggi"}</span>
        </span>
      ) : null}
    </span>
  )
}

/**
 * What the cells need from the page: the state of the list (the headers say
 * which column is sorted, the links carry it along) and the instant the page
 * was rendered at. It travels in the `meta` of the table, NOT in the column
 * definitions: those must be the same objects on every render, or every cell
 * is a new component, remounts after each refresh and takes the focus of its
 * control with it.
 */
export type ContactsTableMeta = {
  state: ContactsListState
  now: Date
  /** The contacts shown under the active one of their customer */
  nestedIds: ReadonlySet<number>
}

const metaOf = (table: Table<ContactRow>) =>
  table.options.meta as ContactsTableMeta

/**
 * The columns of the list (AC4). Their ids are their headers; "Telefono" and
 * "CF" are the ones that can be hidden. Sorting is the address, not the table:
 * the headers navigate, `state` (from the table's meta) says which one is
 * active.
 */
export const contactColumns: ColumnDef<ContactRow>[] = [
  {
    id: "Cliente",
    header: ({ table }) => (
      <SortButton label="Cliente" state={metaOf(table).state} />
    ),
    cell: ({ row, table }) => (
      <CustomerCell
        contactId={row.original.id}
        customer={row.original.customer}
        nested={metaOf(table).nestedIds.has(row.original.id)}
      />
    ),
  },
  {
    id: "Telefono",
    header: "Telefono",
    cell: ({ row }) => row.original.customer.phoneNumber ?? "",
  },
  {
    id: "CF",
    header: "CF",
    cell: ({ row }) =>
      row.original.customer.fiscalCode ?? row.original.customer.vatCode ?? "",
  },
  {
    id: "Stato",
    header: "Stato",
    cell: ({ row, table }) => (
      <ContactRowState
        contact={row.original}
        state={metaOf(table).state}
        describedBy={customerCellId(row.original.id)}
        nested={metaOf(table).nestedIds.has(row.original.id)}
      />
    ),
  },
  {
    id: "Priorità",
    header: ({ table }) => (
      <SortButton label="Priorità" state={metaOf(table).state} />
    ),
    cell: ({ row }) => <PriorityBadge priority={row.original.priority ?? 0} />,
  },
  {
    id: "Operatore",
    header: "Operatore",
    cell: ({ row }) =>
      row.original.operator === null ? (
        <span className="text-muted-foreground">Non assegnato</span>
      ) : (
        operatorDisplayName(row.original.operator)
      ),
  },
  {
    id: "Contattato il",
    header: ({ table }) => (
      <SortButton label="Contattato il" state={metaOf(table).state} />
    ),
    cell: ({ row }) => (
      <div className="w-36">
        {row.original.closedAt ? formatDateAsDMY(row.original.closedAt) : ""}
      </div>
    ),
  },
  {
    id: "Prossimo alert",
    header: ({ table }) => (
      <SortButton label="Prossimo alert" state={metaOf(table).state} />
    ),
    cell: ({ row, table }) => (
      <div className="w-36">
        {row.original.alert === null ? null : (
          <AlertCell alert={row.original.alert} now={metaOf(table).now} />
        )}
      </div>
    ),
  },
  {
    id: "Creato",
    header: ({ table }) => (
      <SortButton label="Creato" state={metaOf(table).state} />
    ),
    cell: ({ row }) => (
      <div className="w-36">{formatDateAsDMY(row.original.createdAt)}</div>
    ),
  },
  {
    id: "Aggiornato",
    header: ({ table }) => (
      <SortButton label="Aggiornato" state={metaOf(table).state} />
    ),
    cell: ({ row }) => (
      <div className="w-36">{formatDateAsDMY(row.original.updatedAt)}</div>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Azioni</span>,
    cell: ({ row, table }) => (
      <ContactRowActions contact={row.original} state={metaOf(table).state} />
    ),
  },
]
