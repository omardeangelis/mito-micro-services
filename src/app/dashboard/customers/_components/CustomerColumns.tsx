"use client"

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
import Link from "next/link"
import React, { useCallback } from "react"
import { cn, formatDateAsDMY } from "@/lib/utils"
import { SortableHeader } from "@/components/custom/table/TableHeaders"
import { seeContactsHref } from "@/app/dashboard/contatti/_lib/searchParams"
import { handleCustomerBlackList } from "../_actions/handleCustomerBlackList"
import { type Customer, type Task } from "@/lib/types/schemas"

import { type TaskStatus } from "@/lib/types/schemas"
import { PlusCircleIcon } from "lucide-react"
import { api } from "@/trpc/react"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import { ContactStateSelect } from "@/components/custom/contact/ContactStateSelect"
import {
  isUnclaimed,
  ReadOnlyReason,
} from "@/components/custom/contact/ReadOnlyReason"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useActor } from "@/components/custom/contact/useActor"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { useRowFocusAfterSave } from "@/components/custom/contact/useRowFocusAfterSave"
import {
  canCreateContact,
  contactEditability,
} from "@/lib/domain/contact/permissions"

export type CustomerColumnSelectedProps = {
  id: string | null
  name: string | null
  surname: string | null
  fiscalCode: string | null
  vatCode: string | null
  signedPractices: number | null
  email: string | null
  phoneNumber: string | null
  comune: string | null
  birthdayDate: Date | null
  blackListStatus: Customer["blackListStatus"]
  createdAt: Customer["createdAt"]
  updatedAt: Customer["updatedAt"]
  sede: Customer["sede"]
  ambitoLavorativo: Customer["ambitoLavorativo"]
  occupazione: Customer["occupazione"]
  operatore?: {
    id: number
    name: string | null
    surname: string | null
  } | null
  activeTasks: number | null
  /** The active contact; `getAllCustomers` gives `{}` when there is none. */
  tasks:
    | (Task & {
        /** The contact's operator, which can differ from the customer's. */
        operatorName: string | null
        operatorSurname: string | null
      })
    | null
}

export const CustomerColumns: ColumnDef<CustomerColumnSelectedProps>[] = [
  {
    id: "select",
    header: ({ table }) => {
      return (
        <div
          className={cn(
            "flex h-12 items-center",
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
                <p className="text-xxs font-bold text-gray-600">Selezionati</p>
                <p className="flex items-center gap-1 text-xxs">
                  <span
                    className={cn(
                      "font-bold",
                      table.getFilteredSelectedRowModel().rows.length ===
                        table.getFilteredRowModel().rows.length
                        ? "text-green-500"
                        : "text-gray-500"
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
        className="flex h-12 w-12 items-center"
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
        <Avatar className="flex items-center justify-center bg-blue-100">
          {props.row.original.operatore?.name?.at(0)}{" "}
          {props.row.original.operatore?.surname?.at(0)}
        </Avatar>
      </div>
    ),
    enableColumnFilter: false,
    enableHiding: false,
  },
  {
    header: () => (
      <div className="flex items-center justify-center">Chiamate</div>
    ),
    id: "Stato Chiamate",
    accessorKey: "tasks",
    enableHiding: true,
    enableColumnFilter: false,

    cell: ({ row }) => {
      return (
        <div
          className="flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <StateSelector
            tasks={row.original.tasks}
            customerId={row.original.id!}
            customerOperatorId={row.original.operatore?.id ?? null}
          />
        </div>
      )
    },
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Contattato il</SortableHeader>
    ),
    id: "Contattato il",
    accessorKey: "contattato",
    enableHiding: true,
    enableColumnFilter: false,
    cell: ({ row }) => {
      const data =
        row.original.tasks?.createdAt === row.original.tasks?.updatedAt
          ? null
          : row.original.tasks?.closedAt

      return (
        <div className="text-center">{data ? formatDateAsDMY(data) : null}</div>
      )
    },
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Priorità</SortableHeader>
    ),
    id: "Priorità",
    accessorKey: "priority",
    enableHiding: true,
    enableColumnFilter: false,
    cell: ({ row }) => {
      if (!row.original.tasks?.customPriority && !row.original.tasks?.priority)
        return null
      return (
        <div className="text-center">
          <PriorityBadge priority={row.original.tasks.priority!} />
        </div>
      )
    },
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
        <TableActionMenu>
          {/* A portal, but its clicks bubble to the row and open the card */}
          <DropdownMenuItem
            asChild
            className="cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={seeContactsHref(customer.id!)} prefetch={false}>
              Vedi contatti
            </Link>
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
              <BlackListedDropDown customerId={customer.id!} />
            </>
          ) : null}
        </TableActionMenu>
      )
    },
  },
]

const BlackListedDropDown: React.FC<{
  customerId: string
}> = (props) => {
  const setBlackListed = useCallback(async () => {
    await handleCustomerBlackList({
      customerId: props.customerId,
      blackListStatus: "review",
    })
  }, [props.customerId])
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

type RowContact = NonNullable<CustomerColumnSelectedProps["tasks"]>

/** The row's active contact, or null when the customer has none. */
const activeContactOf = (
  tasks: CustomerColumnSelectedProps["tasks"]
): RowContact | null => (typeof tasks?.id === "number" ? tasks : null)

/**
 * The "Stato Chiamate" cell: the state of the active contact, through the same
 * rules and mutations as the Contatti section (AC73). It always shows the
 * saved value; the wait lasts until the new saved value is on screen.
 */
function StateSelector(props: {
  tasks: CustomerColumnSelectedProps["tasks"]
  customerId: string
  customerOperatorId: number | null
}) {
  const actor = useActor()
  const contact = activeContactOf(props.tasks)
  const customer = { operatorId: props.customerOperatorId }

  const cellRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const { remember, forget, settle } = useRowFocusAfterSave(cellRef)

  // From the call until the refreshed row is rendered
  const { pending, start, fail, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed(settle)
  const { onError } = useContactMutationFeedback({ refresh })
  const changeState = api.task.changeState.useMutation()
  const createContact = api.task.createContact.useMutation()

  // The change waiting for the user to confirm closing the open alert (P10)
  const [confirmation, setConfirmation] = React.useState<{
    state: TaskStatus
    alert: PendingAlert
  } | null>(null)

  const submitState = (
    taskId: number,
    state: TaskStatus,
    confirmedAlertId: number | null
  ) => {
    remember()
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the row unmounted, so the toast and the refresh still run
    changeState
      .mutateAsync({ taskId, toState: state, source: "list", confirmedAlertId })
      .then(finishAfterRefresh, (error) => {
        const result = onError(error)
        if (result) {
          // An open alert to confirm (AC36), maybe set meanwhile by a
          // colleague (AC37): nothing changed, the modal asks
          fail()
          forget()
          setConfirmation({ state, alert: result.alert })
          return
        }
        // The toast gives the reason, the refresh shows the saved value
        awaitRefresh()
      })
  }

  const create = () => {
    if (pending) return
    remember()
    start()
    createContact
      .mutateAsync({ customerId: props.customerId, source: "list" })
      .then(finishAfterRefresh, (error) => {
        awaitRefresh()
        onError(error)
      })
  }

  const content = () => {
    if (!contact) {
      if (!actor || !canCreateContact(actor, customer)) return null
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Crea contatto"
          title="Crea contatto"
          aria-busy={pending}
          aria-disabled={pending}
          onClick={(e) => {
            e.stopPropagation()
            create()
          }}
        >
          {pending ? (
            <LoadingSpinner className="h-4 w-4 motion-reduce:animate-none" />
          ) : (
            <PlusCircleIcon size={16} />
          )}
        </Button>
      )
    }

    // Until the signed-in user is known nothing is interactive
    if (!actor) return <TaskStatusBadge status={contact.state ?? "nessuno"} />

    const editability = contactEditability(actor, {
      isActive: true,
      taskOperator:
        contact.operatorId === null
          ? null
          : {
              id: contact.operatorId,
              name: contact.operatorName,
              surname: contact.operatorSurname,
            },
      customer,
    })
    // Read-only: the saved state stays visible. The row names no colleague:
    // the Operatore column already does (apart from the contacts "Assegna
    // Clienti" leaves behind, until T6.8)
    if (editability.kind !== "editable")
      return (
        <div className="flex flex-col items-center gap-1">
          <TaskStatusBadge status={contact.state ?? "nessuno"} />
          {isUnclaimed(editability, props.customerOperatorId) ? (
            <ReadOnlyReason
              editability={editability}
              customerUnassigned
              showHint
            />
          ) : null}
        </div>
      )

    return (
      <>
        <ContactStateSelect
          value={contact.state}
          pending={pending}
          triggerRef={triggerRef}
          onChange={(state) => {
            if (pending) return
            submitState(contact.id, state, null)
          }}
        />
        <AlertCloseConfirmDialog
          alert={confirmation?.alert ?? null}
          returnFocusRef={triggerRef}
          onCancel={() => setConfirmation(null)}
          onConfirm={(alertId) => {
            if (!confirmation) return
            setConfirmation(null)
            submitState(contact.id, confirmation.state, alertId)
          }}
        />
      </>
    )
  }

  return (
    <div ref={cellRef} className="flex w-40 items-center justify-center">
      {content()}
    </div>
  )
}
