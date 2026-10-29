import {
  DropDownAction,
  DropDownCilpBoard,
  TableActionMenu,
} from "@/components/custom/table/TableActions"
import { Avatar } from "@/components/ui/avatar"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { type ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router"
import React, { useCallback } from "react"
import { formatDateAsDMY } from "@mito/client/format"
import { cn } from "@/lib/utils"
import { SortableHeader } from "@/components/custom/table/TableHeaders"
import { seeContactsHref } from "@mito/client/contact/searchParams"
import { type CustomerListRow } from "@mito/contract/customer"
import { useSetBlackListStatus } from "@/api/customer"

/** A row of the list, as `getAllCustomers` returns it */
export type CustomerColumnSelectedProps = CustomerListRow

export const CustomerColumns: ColumnDef<CustomerColumnSelectedProps>[] = [
  {
    id: "select",
    header: ({ table }) => {
      return (
        <div
          className={cn(
            "h-7.5 flex items-center",
            table.getFilteredSelectedRowModel().rows.length ? "w-40" : "w-12"
          )}
        >
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
          {table.getIsSomePageRowsSelected() ||
          table.getIsAllPageRowsSelected() ? (
            <div className="flex w-full items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() =>
                  useCustomerTableStore.setState({
                    bulkActionDialogOpen: true,
                  })
                }
              >
                Edit
              </Button>
              <div>
                <p className="text-xxs font-bold text-muted-foreground">
                  Selezionati
                </p>
                <p className="flex items-center gap-1 text-xxs">
                  <span
                    className={cn(
                      "font-bold",
                      table.getFilteredSelectedRowModel().rows.length ===
                        table.getFilteredRowModel().rows.length
                        ? "text-success-soft-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {table.getFilteredSelectedRowModel().rows.length}
                  </span>{" "}
                  -
                  <span className="font-bold">
                    {table.getFilteredRowModel().rows.length}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )
    },
    cell: ({ row }) => (
      <div
        className="h-7.5 flex w-12 items-center"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    enableColumnFilter: false,
  },
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
    enableHiding: true,
    enableColumnFilter: false,
    cell: ({ row }) => <div className="text-left">{row.original.id}</div>,
  },
  {
    header: () => <div className="text-left">Codice Fiscale</div>,
    id: "Codice Fiscale",
    accessorKey: "fiscalCode",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="min-w-40 text-left">
        {row.original.fiscalCode ?? row.original.vatCode}
      </div>
    ),
  },
  {
    header: () => <div className="text-left">Sede</div>,
    id: "Sede",
    accessorKey: "sede",
    enableHiding: true,
    enableColumnFilter: false,
    cell: ({ row }) => (
      <div className="text-left">{row.original.sede ?? "Missing"}</div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Nome</SortableHeader>
    ),
    id: "Nome",
    accessorKey: "name",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="min-w-40 text-center">{row.original.name}</div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Cognome</SortableHeader>
    ),
    id: "Cognome",
    accessorKey: "surname",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="w-full min-w-40 text-center">{row.original.surname}</div>
    ),
  },
  {
    header: () => <div className="text-left">Ambito</div>,
    id: "Ambito",
    accessorKey: "ambitoLavorativo",
    enableHiding: true,
    enableColumnFilter: false,
  },
  {
    header: () => <div className="text-left">Occupazione</div>,
    id: "Occupazione",
    accessorKey: "occupazione",
    enableHiding: true,
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader className="justify-between" column={column}>
        Email
      </SortableHeader>
    ),
    id: "email",
    accessorKey: "email",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="text-left">{row.original.email ?? "Missing"}</div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Telefono</SortableHeader>
    ),
    id: "Telefono",
    accessorKey: "phoneNumber",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="text-center">{row.original.phoneNumber ?? "Missing"}</div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Comune</SortableHeader>
    ),
    id: "Comune",
    accessorKey: "comune",
    enableHiding: true,
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="text-center">{row.original.comune ?? "Missing"}</div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Creato</SortableHeader>
    ),
    id: "Creato il",
    accessorKey: "createdAt",
    enableHiding: true,
    enableColumnFilter: false,
    cell: ({ row }) => (
      <div className="text-center">
        {formatDateAsDMY(row.original.createdAt)}
      </div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Aggiornato</SortableHeader>
    ),
    id: "Aggiornato il",
    accessorKey: "updatedAt",
    enableHiding: true,
    enableColumnFilter: false,

    cell: ({ row }) => (
      <div className="text-center">
        {formatDateAsDMY(row.original.updatedAt)}
      </div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Nato il</SortableHeader>
    ),
    id: "Nato il",
    accessorKey: "birthdayDate",
    enableHiding: true,
    enableColumnFilter: false,

    cell: ({ row }) => (
      <div className="text-center">
        {row.original.birthdayDate
          ? formatDateAsDMY(row.original.birthdayDate)
          : "Missing"}
      </div>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Pratiche</SortableHeader>
    ),
    id: "Numero Pratiche",
    accessorKey: "signedPractices",
    enableColumnFilter: false,
    enableHiding: true,
    cell: ({ row }) => (
      <div className="text-center">{row.original.signedPractices}</div>
    ),
  },
  {
    header: () => (
      <div className="flex items-center justify-center">Operatore</div>
    ),
    id: "operatore",
    accessorKey: "operatore",
    cell: (props) => (
      <div className="flex items-center justify-center">
        <Avatar className="bg-tag-neutral-bg text-tag-neutral-text size-7.5 flex items-center justify-center">
          {props.row.original.operatore?.name?.at(0)}{" "}
          {props.row.original.operatore?.surname?.at(0)}
        </Avatar>
      </div>
    ),
    enableColumnFilter: false,
    enableHiding: false,
  },
  {
    id: "actions",
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
    header: "actions",
    cell: ({ row }) => {
      const customer = row.original
      return (
        // The click that opens the menu doesn't open the customer: in a
        // browser the open menu takes the pointer, in jsdom it doesn't
        <div onClick={(e) => e.stopPropagation()}>
          <TableActionMenu>
            {/* A portal, but its clicks bubble to the row and open the card */}
            <DropdownMenuItem
              asChild
              className="cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <Link to={seeContactsHref(customer.id)}>Vedi contatti</Link>
            </DropdownMenuItem>
            <DropdownMenuLabel>Copia</DropdownMenuLabel>
            {(customer.fiscalCode ?? customer.vatCode) ? (
              <DropDownCilpBoard
                label="Copia Codice Fiscale"
                value={customer.fiscalCode ?? customer.vatCode!}
              />
            ) : null}
            {customer.email ? (
              <DropDownCilpBoard label="Copia Email" value={customer.email} />
            ) : null}
            {customer.phoneNumber ? (
              <DropDownCilpBoard
                label="Copia Numero di Telefono"
                value={customer.phoneNumber}
              />
            ) : null}
            {customer.blackListStatus === "whitelisted" ? (
              <>
                <DropdownMenuSeparator />
                <BlackListedDropDown customerId={customer.id} />
              </>
            ) : null}
          </TableActionMenu>
        </div>
      )
    },
  },
]

const BlackListedDropDown: React.FC<{
  customerId: string
}> = (props) => {
  const { mutate } = useSetBlackListStatus()
  const setBlackListed = useCallback(() => {
    mutate({ customerId: props.customerId, blackListStatus: "review" })
  }, [mutate, props.customerId])
  return (
    <>
      <DropdownMenuLabel>BlackList</DropdownMenuLabel>
      <DropDownAction
        label={"Aggiungi alla BlackList"}
        onClick={setBlackListed}
      />
    </>
  )
}
