import { useCallback, useRef, useState } from "react"
import { type Role } from "@mito/contract/schemas"
import { describeApiError, isApiFailure } from "@/api/errors"
import { useUpdateOperatorsRole } from "@/api/operator"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { DeactivateOperatorDialog } from "./DeactivateOperatorDialog"

export type OperatorRow = {
  id: number
  name: string | null
  surname: string | null
  role: Role
}

type RoleEdit = { id: number; role: Role }

const isRole = (value: string): value is Role =>
  value === "ADMIN" || value === "OPERATORE"

/**
 * The operators and their roles, as `OperatorTable` of the Next.js app
 * (AC20a, AC21): the roles chosen are saved together with "Salva", and each
 * operator but the admins and the current one can be deactivated. A role
 * chosen for a row that went (deactivated here or elsewhere) is dropped, and
 * doesn't come back with the row
 */
export const OperatorTable = ({
  data,
  currentOperatorId,
}: {
  data: readonly OperatorRow[]
  currentOperatorId: number | undefined
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { toast } = useToast()
  const updateRoles = useUpdateOperatorsRole()

  const [edits, setEdits] = useState<readonly RoleEdit[]>([])
  // An edit whose row is gone must not come back with the row: drop it
  const shown = edits.filter((edit) => data.some((row) => row.id === edit.id))
  if (shown.length !== edits.length) setEdits(shown)

  const editRole = (id: number, role: Role) =>
    setEdits((current) =>
      current.some((edit) => edit.id === id)
        ? current.map((edit) => (edit.id === id ? { id, role } : edit))
        : [...current, { id, role }]
    )
  const dropEdit = useCallback(
    (id: number) =>
      setEdits((current) => current.filter((edit) => edit.id !== id)),
    []
  )

  const save = async () => {
    try {
      await updateRoles.mutateAsync(shown)
    } catch (failure) {
      toast({
        // The errors of the roles say what to do; the others don't
        title:
          isApiFailure(failure) &&
          (failure._tag === "LastAdmin" || failure._tag === "OperatorNotFound")
            ? describeApiError(failure)
            : "Errore durante l'aggiornamento dei ruoli",
        duration: 2000,
        variant: "destructive",
      })
      return
    }
    toast({ title: "Ruoli aggiornati", duration: 2000, variant: "success" })
    setEdits([])
  }

  const disabled = shown.length === 0 || updateRoles.isPending

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
          onClick={() => void save()}
        >
          <span>Salva</span>
        </Button>
      </div>
      <Table className="mt-4 overflow-hidden">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cognome</TableHead>
            <TableHead>
              <div className="flex w-full justify-end">
                <span>Ruolo</span>
              </div>
            </TableHead>
            <TableHead>
              <span className="sr-only">Disattiva</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((row) => (
              // Keyed by id: with index keys the next row reuses the removed
              // row's select
              <TableRow
                className="cursor-pointer hover:bg-gray-100"
                key={row.id}
              >
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.surname}</TableCell>
                <TableCell>
                  <div className="flex w-full justify-end">
                    <Select
                      // A role chosen while saving would not be sent
                      disabled={updateRoles.isPending}
                      value={
                        shown.find((edit) => edit.id === row.id)?.role ?? ""
                      }
                      onValueChange={(role) => {
                        if (isRole(role)) editRole(row.id, role)
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={row.role.toLowerCase()} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Ruoli</SelectLabel>
                          <SelectItem value="ADMIN" className="cursor-pointer">
                            Admin
                          </SelectItem>
                          <SelectItem
                            value="OPERATORE"
                            className="cursor-pointer"
                          >
                            Operatore
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  {row.role === "OPERATORE" && row.id !== currentOperatorId ? (
                    <div className="flex w-full justify-end">
                      <DeactivateOperatorDialog
                        operator={{
                          id: row.id,
                          name: row.name ?? "",
                          surname: row.surname ?? "",
                        }}
                        onDeactivated={dropEdit}
                        returnFocusTo={headingRef}
                      />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
