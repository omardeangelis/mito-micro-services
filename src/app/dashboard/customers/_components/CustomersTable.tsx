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
import React, { useCallback, useMemo } from "react"

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

  const updateFn = useCallback(
    (columns: string[]) => {
      fetch("/api/user/preferences?pref=ct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences: {
            customerTableVisibleColumns: columns,
          },
        }),
      })
        .then((_) => {
          setCustomerTableVisibleColumns(columns)
        })
        .catch(console.error)
    },
    [setCustomerTableVisibleColumns]
  )

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => ({
      ...defaultColumns,
      id: false,
      select: role === "ADMIN",
    }))

  const arrayOfHiddenColumns = useMemo(
    () => Object.keys(columnVisibility).filter((key) => !columnVisibility[key]),
    [columnVisibility]
  )

  React.useEffect(() => {
    updateFn(arrayOfHiddenColumns)
  }, [arrayOfHiddenColumns, updateFn])

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const searchParams = useSearchParams()
  const [sorting, setSorting] = React.useState<SortingState>(() => {
    const orderBy = searchParams.get("order_by")?.split(",") ?? []
    const sortedBy = searchParams.get("sorted_by")?.split(",") ?? []

    if (!orderBy.length)
      return [
        {
          id: "priority",
          desc: true,
        },
      ]
    return orderBy.map((id, index) => ({
      // @ts-expect-error ts-migrate(2531) accessorKey exists
      id: columns.find((c) => c.accessorKey === id)?.id ?? id,
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
