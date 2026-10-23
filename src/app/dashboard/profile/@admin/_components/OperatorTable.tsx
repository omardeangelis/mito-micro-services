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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { DeactivateOperatorDialog } from "./DeactivateOperatorDialog"
import {
  describeActionError,
  isContactErrorCode,
} from "../_lib/describeActionError"

type MockedOperator = Pick<OperatorWithRole, "id" | "name" | "role" | "surname">

export type OperatorColumnSelectedProps = MockedOperator

const buildColumns = (
  currentOperatorId: number,
  headingRef: RefObject<HTMLElement>,
  onDeactivated: (operatorId: number) => void
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
            onDeactivated={onDeactivated}
            returnFocusTo={headingRef}
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
  currentOperatorId: number
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const removeOperatorToEdit = useOperatorTableStore.use.removeOperatorToEdit()
  const operatorColumns = useMemo(
    () => buildColumns(currentOperatorId, headingRef, removeOperatorToEdit),
    [currentOperatorId, removeOperatorToEdit]
  )
  const table = useReactTable({
    columns: operatorColumns,
    data: data,
    // Keyed by id: with index keys the next row reuses the removed row's DOM
    getRowId: (row) => String(row.id),
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
  const pruneOperatorsToEdit = useOperatorTableStore.use.pruneOperatorsToEdit()
  const [loading, setLoading] = useState(false)
  // An edit whose row is gone must not come back with the row: drop it
  useEffect(() => {
    pruneOperatorsToEdit(data.map((row) => row.id))
  }, [data, pruneOperatorsToEdit])

  const handleOperatorRoleChange = useCallback(async () => {
    setLoading(true)
    try {
      const res = await updateOperatorsRoleAction(operators)
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
    } catch {
      toast({
        title: "Errore durante l'aggiornamento dei ruoli",
        duration: 2000,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [operators, toast, clearOperatorsToEdit])

  const disabled = !operators.length || loading

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="rounded-sm text-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Gestisci operatori
        </h1>
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
