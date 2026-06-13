"use client"

import {
  DropDownAction,
  DropDownCilpBoard,
  TableActionMenu,
} from "@/components/custom/table/TableActions"
import { Avatar } from "@/components/ui/avatar"
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { type ColumnDef } from "@tanstack/react-table"
import React, { useCallback } from "react"
import { cn, formatDateAsDMY } from "@/lib/utils"
import { SortableHeader } from "@/components/custom/table/TableHeaders"
import { Badge } from "@/components/ui/badge"
import { cva } from "class-variance-authority"
import { handleCustomerBlackList } from "../_actions/handleCustomerBlackList"
import {
  type TaskCategory,
  type Customer,
  type Task,
} from "@/lib/types/schemas"

import { type TaskStatus } from "@/lib/types/schemas"
import { taskStatus } from "@/server/db/schema/task"
import { getTaskStatusCategory } from "../_utils"
import { useOptimistic } from "react"
import { taskStatusAction } from "../_actions/taskStatusAction"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PlusCircleIcon } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { ToastAction } from "@/components/ui/toast"
import { api } from "@/trpc/react"
import { PriorityBadge } from "@/components/custom/badge/priority"

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
  tasks: Task | null
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
            operatorId={row.original.operatore?.id ?? null}
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

const activeVariants = cva("", {
  variants: {
    state: {
      idle: "bg-gray-100 text-grey-800",
      open: "bg-green-100 text-green-800",
      close: "bg-blue-100 text-blue-800",
    } satisfies Record<TaskCategory, string>,
  },
  defaultVariants: { state: "idle" },
})

type TaskBadgeProps = {
  tasks: CustomerColumnSelectedProps["tasks"]
}

export const TaskBadge = React.memo(({ tasks }: TaskBadgeProps) => {
  return (
    <Badge
      variant={"outline"}
      size={"xs"}
      className={activeVariants({
        state: getTaskStatusCategory(tasks?.state ?? "nessuno"),
      })}
    >
      {tasks?.state ?? "nessuno"}
    </Badge>
  )
})

export const TaskBadgeV2 = React.memo(({ status }: { status: TaskStatus }) => {
  return (
    <Badge
      variant={"outline"}
      size={"xs"}
      className={activeVariants({
        state: getTaskStatusCategory(status),
      })}
    >
      {status}
    </Badge>
  )
})

TaskBadgeV2.displayName = "TaskBadgeV2"

TaskBadge.displayName = "TaskBadge"

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

function StateSelector(props: {
  tasks: CustomerColumnSelectedProps["tasks"]
  customerId: string
  operatorId: number | null
}) {
  const [open, setOpen] = React.useState(false)
  const { role } = useUserPreferenceContext((state) => state)
  const deleteAlert = api.task.deleteAlerts.useMutation()
  const [optimisticState, setOptimisticState] = useOptimistic(
    props.tasks?.state,
    (_, newState: TaskStatus) => newState
  )
  const availableStates = React.useMemo(() => {
    return taskStatus.filter((s) => {
      if (optimisticState === "followup")
        return s !== "chiamare" && s !== optimisticState
      return s !== "followup" && s !== optimisticState
    })
  }, [optimisticState])

  const { toast } = useToast()

  const handleSelectChange = useCallback(
    async (value: TaskStatus) => {
      if (!props.operatorId)
        return toast({
          title: "Cliente non assegnato",
          description: "Devi assegnare un operatore al cliente",
          variant: "destructive",
          duration: 5000,
        })
      if (role !== "ADMIN" && props.operatorId !== props.tasks?.operatorId) {
        return toast({
          title: "Operazione non consentita",
          description:
            "Puoi modificare solo i customers o pratiche che ti sono assegnati.",
          variant: "destructive",
          duration: 3000,
        })
      }
      if (props.tasks?.state === value) return
      if (props.tasks?.alertId) {
        return toast({
          title: "Richiesta Conferma",
          description:
            "Modificando lo stato del task verrà eliminata l'alert associato",
          variant: "info",
          closeManually: true,
          action: (
            <ToastAction altText="conferma" asChild>
              <button
                onClick={async () => {
                  setOptimisticState(value)
                  setOpen(false)
                  await deleteAlert.mutateAsync({ id: props.tasks!.alertId! })
                  await taskStatusAction({
                    customerId: props.customerId,
                    newState: value,
                    oldState: props.tasks?.state ?? "nessuno",
                    taskId: props.tasks?.id ?? null,
                    operatorId: props.operatorId,
                    isActive: true,
                  })
                }}
              >
                Conferma
              </button>
            </ToastAction>
          ),
          duration: 3000,
        })
      }
      setOptimisticState(value)
      setOpen(false)
      await taskStatusAction({
        customerId: props.customerId,
        newState: value,
        oldState: props.tasks?.state ?? "nessuno",
        taskId: props.tasks?.id ?? null,
        operatorId: props.operatorId,
        isActive: true,
      })
    },
    [
      props.operatorId,
      props.tasks,
      props.customerId,
      toast,
      role,
      setOptimisticState,
      deleteAlert,
    ]
  )

  if (!optimisticState)
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={async (e) => {
          e.stopPropagation()
          await handleSelectChange("chiamare")
        }}
      >
        <PlusCircleIcon size={16} />
      </Button>
    )
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button variant="ghost">
          <TaskBadgeV2 status={optimisticState} />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="bg-white">
          {availableStates.map((state) => (
            <div
              className="cursor-pointer p-2 hover:bg-gray-100"
              key={state}
              onClick={async (e) => {
                e.stopPropagation()
                await handleSelectChange(state)
              }}
            >
              <p>{state}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
