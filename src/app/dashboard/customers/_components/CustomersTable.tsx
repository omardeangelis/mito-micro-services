"use client"
import {
  useReactTable,
  type ColumnDef,
  getCoreRowModel,
  flexRender,
  type VisibilityState,
  type RowSelectionState,
  type SortingState,
  type Row,
} from "@tanstack/react-table"
import React, { useMemo } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRouter, useSearchParams } from "next/navigation"
import { TableFilterSections } from "./TableFilterSections"
import { TablePagination } from "@/components/custom/table/TablePagination"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { CustomerBulkDialog } from "./CustomerBulkDialog"
import { cn } from "@/lib/utils"
import { type CustomerColumnSelectedProps } from "./CustomerColumns"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PlusSquareIcon } from "lucide-react"
import { REMOVED_CUSTOMER_COLUMN_IDS } from "../_constants"

/** Last modified first: the id of the "Aggiornato il" column. */
const DEFAULT_SORTING: SortingState = [{ id: "Aggiornato il", desc: true }]

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function CustomersTable<TData, TValue>({
  columns,
  data,
  total,
  defaultColumns,
}: DataTableProps<TData, TValue> & {
  total: number
  defaultColumns: VisibilityState | undefined
}) {
  const role = useUserPreferenceContext(useShallow((state) => state.role))
  const setCustomerTableVisibleColumns = useUserPreferenceContext(
    (state) => state.setCustomerTableVisibleColumns
  )

  // The store has the last choice, the server prop only the one of the
  // render in the router cache: it seeds the first render of a visit
  const storedColumns = useUserPreferenceContext(
    (state) => state.preferences?.customerTableVisibleColumns
  )

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => ({
      ...(storedColumns
        ? Object.fromEntries(
            storedColumns
              .filter((column) => !REMOVED_CUSTOMER_COLUMN_IDS.includes(column))
              .map((column) => [column, false])
          )
        : defaultColumns),
      id: false,
      select: role === "ADMIN",
    }))

  const arrayOfHiddenColumns = useMemo(
    () => Object.keys(columnVisibility).filter((key) => !columnVisibility[key]),
    [columnVisibility]
  )

  // The cookie is written when the operator changes the columns, not on mount
  const savedColumns = React.useRef(arrayOfHiddenColumns)
  React.useEffect(() => {
    if (savedColumns.current === arrayOfHiddenColumns) return
    savedColumns.current = arrayOfHiddenColumns
    setCustomerTableVisibleColumns(arrayOfHiddenColumns)
  }, [arrayOfHiddenColumns, setCustomerTableVisibleColumns])

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const searchParams = useSearchParams()
  const [sorting, setSorting] = React.useState<SortingState>(() => {
    const orderBy = searchParams.get("order_by")?.split(",") ?? []
    const sortedBy = searchParams.get("sorted_by")?.split(",") ?? []

    // The column an `order_by` id names: by its `accessorKey` (what the URL
    // has) or by its `id`. The ones Clienti no longer has (`contattato`,
    // `priority`) and made-up names name none.
    const columnOf = (id: string) =>
      columns.find(
        (c) => ("accessorKey" in c && c.accessorKey === id) || c.id === id
      )

    // No sort, or one that names a missing column: the default as a whole,
    // direction included, so the removed parameters are not written back to
    // the URL
    if (!orderBy.length || !orderBy.every((id) => columnOf(id)))
      return DEFAULT_SORTING
    return orderBy.map((id, index) => ({
      id: columnOf(id)?.id ?? id,
      desc: sortedBy[index] === "desc",
    }))
  })
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,

    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    getRowId: (row: any) => (row.id as number).toString(),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: (newSorting) => {
      setSorting(newSorting)
    },
  })

  const setSelectedCustomer = useCustomerTableStore.use.setSelectedCustomer()

  const resetSelectedCustomer =
    useCustomerTableStore.use.clearSelectedCustomer()

  const resetSelctedState = React.useCallback(() => {
    setRowSelection({})
    resetSelectedCustomer()
  }, [resetSelectedCustomer])

  React.useEffect(() => {
    const selectedPractices = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => key)

    setSelectedCustomer(selectedPractices)
  }, [rowSelection, setSelectedCustomer])

  const router = useRouter()

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
      sorting.map((s) => (s.desc ? "desc" : "asc")).join(",") as "asc" | "desc"
    )
    router.push(url.toString())
  }, [router, sorting, table])

  return (
    <div className="relative h-[inherit]">
      <TableFilterSections allColumns={table.getAllColumns()} />
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
              {table.getRowModel().rows?.length ? (
                table
                  .getRowModel()
                  .rows.map(
                    (row: Row<CustomerColumnSelectedProps>, index, array) => {
                      return (
                        <TableRow
                          className={cn(
                            "cursor-pointer hover:bg-gray-100",
                            row.original.blackListStatus === "blacklisted"
                              ? "bg-red-50"
                              : row.original.blackListStatus === "review"
                                ? "bg-yellow-50"
                                : undefined
                          )}
                          key={row.id}
                          data-state={row.getIsSelected() && "selected"}
                          onClick={() => {
                            router.push(
                              `/dashboard/customers/${row.original.id}`
                            )
                          }}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              className={
                                index === 0 || index + 1 === array.length
                                  ? "min-w-8"
                                  : "min-w-[150px]"
                              }
                              key={cell.id}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    }
                  )
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
      <div className="sticky bottom-0 left-0 z-10 flex w-full items-center justify-between bg-card px-4 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Button size="icon" variant="outline" asChild>
                <Link href="/dashboard/customers/new">
                  <PlusSquareIcon size={20} />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Crea un nuovo cliente</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TablePagination itemCount={total} />
      </div>
      <CustomerBulkDialog onClose={resetSelctedState} />
    </div>
  )
}
