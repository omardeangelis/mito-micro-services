"use client"

import { type OperatorWithRole } from "@mito/domain/schemas"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOperatorTableStore } from "../_store/useOperatorTableStore"
import { Button } from "@/components/ui/button"
import { updateOperatorsRoleAction } from "../_actions/updateOperatorsRole"
import { useToast } from "@/components/ui/use-toast"
import { useCallback, useMemo, useState } from "react"
import { DeactivateOperatorDialog } from "./DeactivateOperatorDialog"
import {
  describeActionError,
  isContactErrorCode,
} from "../_lib/describeActionError"

type MockedOperator = Pick<OperatorWithRole, "id" | "name" | "role" | "surname">

export type OperatorColumnSelectedProps = MockedOperator

const buildColumns = (
  currentOperatorId: number | undefined
): ColumnDef<OperatorColumnSelectedProps>[] => [
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
  },
  {
    id: "name",
    header: "Nome",
    accessorKey: "name",
  },
  {
    id: "surname",
    header: "Cognome",
    accessorKey: "surname",
  },
  {
    id: "actions",
    header: () => (
      <div className="flex w-full justify-end">
        <span>Ruolo</span>
      </div>
    ),
    cell: ({ row }) => {
      const addOperatorToEdit = useOperatorTableStore.use.addOperatorToEdit()
      return (
        <div className="flex w-full justify-end">
          <Select
            onValueChange={(role) =>
              addOperatorToEdit({
                id: row.original.id,
                role: role as OperatorColumnSelectedProps["role"],
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={row.original.role.toLowerCase()} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Ruoli</SelectLabel>
                <SelectItem value="ADMIN" className="cursor-pointer">
                  Admin
                </SelectItem>
                <SelectItem value="OPERATORE" className="cursor-pointer">
                  Operatore
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )
    },
  },
  {
    id: "deactivate",
    header: () => <span className="sr-only">Disattiva</span>,
    cell: ({ row }) => {
      const { id, name, surname, role } = row.original
      if (role !== "OPERATORE" || id === currentOperatorId) return null
      return (
        <div className="flex w-full justify-end">
          <DeactivateOperatorDialog
            operator={{ id, name: name ?? "", surname: surname ?? "" }}
          />
        </div>
      )
    },
  },
]

export const OperatorTable = ({
  data,
  currentOperatorId,
}: {
  data: OperatorWithRole[]
  currentOperatorId?: number
}) => {
  const operatorColumns = useMemo(
    () => buildColumns(currentOperatorId),
    [currentOperatorId]
  )
  const table = useReactTable({
    columns: operatorColumns,
    data: data,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility: {
        id: false,
      },
    },
  })

  const { toast } = useToast()

  const operators = useOperatorTableStore.use.operatorsToEdit()
  const clearOperatorsToEdit = useOperatorTableStore.use.clearOperatorsToEdit()
  const [loading, setLoading] = useState(false)

  const handleOperatorRoleChange = useCallback(async () => {
    setLoading(true)
    const res = await updateOperatorsRoleAction(operators)
    setLoading(false)
    if (res.error) {
      toast({
        title: isContactErrorCode(res.error)
          ? describeActionError(res.error)
          : "Errore durante l'aggiornamento dei ruoli",
        duration: 2000,
        variant: "destructive",
      })
      return
    }
    toast({
      title: "Ruoli aggiornati",
      duration: 2000,
      variant: "success",
    })
    clearOperatorsToEdit()
  }, [operators, toast, clearOperatorsToEdit])

  const disabled = !operators.length || loading

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Gestisci operatori</h1>
        <Button
          variant={disabled ? "disabled" : "default"}
          disabled={disabled}
          onClick={handleOperatorRoleChange}
        >
          <span>Salva</span>
        </Button>
      </div>
      <Table className="mt-4 overflow-hidden">
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
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={operatorColumns.length}
                className="h-24 text-center"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
