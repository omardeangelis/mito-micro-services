"use client"

import React, { useCallback, useMemo } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type RowSelectionState,
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
import { useRouter, useSearchParams } from "next/navigation"
import { TablePagination } from "../../../../components/custom/table/TablePagination"
import { TableFilterSection } from "@/app/dashboard/pratiche/_components/TableFilterSection"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
// import { type Result } from "@/server/api/routers/pratiche/GET"
// import { usePracticeTableStore } from "@/store/usePracticeTableStore"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  // tempResult: Result
}

export function PracticesTable<TData, TValue>({
  columns,
  data,
  total,
  // tempResult,
  dafaultColumns,
}: DataTableProps<TData, TValue> & {
  total: number
  dafaultColumns: VisibilityState | undefined
}) {
  const searchParams = useSearchParams()
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const setPracticesTableVisibleColumns = useUserPreferenceContext(
    (state) => state.setPracticesTableVisibleColumns
  )
  const updateFn = useCallback(
    (columns: string[]) => {
      fetch("/api/user/preferences?pref=pt", {
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
          setPracticesTableVisibleColumns(columns)
        })
        .catch(console.error)
    },
    [setPracticesTableVisibleColumns]
  )

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(dafaultColumns ?? {})

  const [sorting, setSorting] = React.useState<SortingState>(() => {
    const orderBy = searchParams.get("order_by")?.split(",") ?? []
    const sortedBy = searchParams.get("sorted_by")?.split(",") ?? []

    if (!orderBy.length)
      return [
        {
          id: "Data Aggiornamento",
          desc: false,
        },
      ]
    return orderBy.map((id, index) => ({
      // @ts-expect-error ts-migrate(2531) accessorKey exists
      id: columns.find((c) => c.accessorKey === id)?.id ?? id,
      desc: sortedBy[index] === "desc",
    }))
  })

  const router = useRouter()

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    getRowId: (row: any) => row!.praticaId as string,
    state: {
      sorting,
      rowSelection,
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
      sorting.map((s) => (s.desc ? "desc" : "asc")).join(",") as "asc" | "desc"
    )
    router.push(url.toString())
  }, [router, sorting, table])

  const columnssss = React.useMemo(() => table.getAllColumns(), [table])

  const arrayOfHiddenColumns = useMemo(
    () => Object.keys(columnVisibility).filter((key) => !columnVisibility[key]),
    [columnVisibility]
  )

  React.useEffect(() => {
    updateFn(arrayOfHiddenColumns)
  }, [arrayOfHiddenColumns, updateFn])

  return (
    <div className="relative h-[inherit]">
      <TableFilterSection allColumns={columnssss} />
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
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="cursor-pointer hover:bg-gray-100"
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => {
                      router.push(
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        `/dashboard/pratiche/${row.getValue("ID Pratica")}`
                      )
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
      {/* <BulkActionDialog onClose={resetSelctedState} /> */}
    </div>
  )
}
