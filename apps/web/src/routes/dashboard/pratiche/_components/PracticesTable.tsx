import React, { useMemo } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { TablePagination } from "@/components/custom/table/TablePagination"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { type PraticheColumnSelectedProps } from "./PracticeColumns"
import { TableFilterSection } from "./TableFilterSection"

/** The last updated last, as the Next.js app: the "Aggiornato" column. */
const DEFAULT_SORTING: SortingState = [
  { id: "Data Aggiornamento", desc: false },
]

/** The address of the detail of a practice: its `praticaId` is free text */
export const practiceHref = (praticaId: string) =>
  `/dashboard/pratiche/${encodeURIComponent(praticaId)}`

interface DataTableProps<TValue> {
  columns: ColumnDef<PraticheColumnSelectedProps, TValue>[]
  data: PraticheColumnSelectedProps[]
  total: number
}

/**
 * The practices table, as `PracticesTable` of the Next.js app: the sort lives
 * in the address, the hidden columns in the preferences (the cookie)
 */
export function PracticesTable<TValue>({
  columns,
  data,
  total,
}: DataTableProps<TValue>) {
  const searchParams = useSearchParams()
  const setPracticesTableVisibleColumns = useUserPreferenceContext(
    (state) => state.setPracticesTableVisibleColumns
  )
  // The hidden columns: the cookie, or the copy of the server, in the store
  const storedColumns = useUserPreferenceContext(
    (state) => state.preferences?.practicesTableVisibleColumns
  )

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      Object.fromEntries((storedColumns ?? []).map((column) => [column, false]))
    )

  const [sorting, setSorting] = React.useState<SortingState>(() => {
    const orderBy = searchParams.get("order_by")?.split(",") ?? []
    const sortedBy = searchParams.get("sorted_by")?.split(",") ?? []

    // The column an `order_by` id names: by its `accessorKey` (what the URL
    // has) or by its `id`
    const columnOf = (id: string) =>
      columns.find(
        (c) => ("accessorKey" in c && c.accessorKey === id) || c.id === id
      )

    // No sort, or one that names a missing column: the default as a whole,
    // as the server sorts it
    if (!orderBy.length || !orderBy.every((id) => columnOf(id)))
      return DEFAULT_SORTING
    return orderBy.map((id, index) => ({
      id: columnOf(id)?.id ?? id,
      desc: sortedBy[index] === "desc",
    }))
  })

  const router = useRouter()

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.praticaId,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: (newSorting) => {
      setSorting(newSorting)
    },
  })

  React.useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set(
      "order_by",
      sorting
        .map(
          (s) =>
            // @ts-expect-error ts-migrate(2531) accessorKey exists
            (table.getColumn(s.id)?.columnDef?.accessorKey ?? s.id) as string
        )
        .join(",")
    )
    url.searchParams.set(
      "sorted_by",
      sorting.map((s) => (s.desc ? "desc" : "asc")).join(",")
    )
    router.push(url.toString())
  }, [router, sorting, table])

  const arrayOfHiddenColumns = useMemo(
    () => Object.keys(columnVisibility).filter((key) => !columnVisibility[key]),
    [columnVisibility]
  )

  // The cookie is written when the operator changes the columns, not on mount
  const savedColumns = React.useRef(arrayOfHiddenColumns)
  React.useEffect(() => {
    if (savedColumns.current === arrayOfHiddenColumns) return
    savedColumns.current = arrayOfHiddenColumns
    setPracticesTableVisibleColumns(arrayOfHiddenColumns)
  }, [arrayOfHiddenColumns, setPracticesTableVisibleColumns])

  return (
    <div className="relative h-[inherit]">
      <TableFilterSection allColumns={table.getAllColumns()} />
      <div className="dashboard-content">
        <div className="rounded-md border">
          <Table className="overflow-hidden">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="cursor-pointer hover:bg-gray-100"
                    key={row.id}
                    onClick={() => {
                      router.push(practiceHref(row.original.praticaId))
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
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="sticky bottom-0 left-0 z-10 flex w-full items-center justify-end bg-card px-4 py-2">
        <TablePagination itemCount={total} />
      </div>
    </div>
  )
}
