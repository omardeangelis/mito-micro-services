"use client"

import { useRef, useState } from "react"
import { type Task, type TaskStatus } from "@/lib/types/schemas"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { AlertCloseConfirmDialog } from "@/components/custom/contact/AlertCloseConfirmDialog"
import { ContactStateSelect } from "@/components/custom/contact/ContactStateSelect"
import { ReadOnlyReason } from "@/components/custom/contact/ReadOnlyReason"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useActor } from "@/components/custom/contact/useActor"
import { focusIsLost } from "@/components/custom/contact/focus"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { contactEditability } from "@/lib/domain/contact/permissions"
import {
  type PriorityBand,
  bandOf,
  bandValue,
  priorityBands,
} from "@/lib/domain/contact/priority"
import { formatDeadline } from "@/lib/utils/format"
import { api } from "@/trpc/react"

type TaskManager = {
  tasks: Task[]
  /** The customer's operator, which can differ from the contact's (D2, A1). */
  customerOperatorId: number | null
}

const bandLabels: Record<PriorityBand, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
}

const AUTO = "auto"

type PriorityChoice = PriorityBand | typeof AUTO

const isPriorityChoice = (value: string): value is PriorityChoice =>
  value === AUTO || (priorityBands as readonly string[]).includes(value)

/**
 * The state and the priority of the customer's active contact. Each is saved
 * as soon as it is chosen, through the same rules and mutations as the Clienti
 * row (D11): the controls show the saved value, and the wait lasts until the
 * refreshed value is on screen.
 */
export const CustomerTaskManager = (props: TaskManager) => {
  const task = props.tasks[0]!
  const actor = useActor()
  const customer = { operatorId: props.customerOperatorId }

  const { data: operator, isInitialLoading: operatorIsLoading } =
    api.operator.getOperatorById.useQuery(
      { id: task.operatorId ?? undefined },
      { enabled: task.operatorId !== null }
    )

  const stateTriggerRef = useRef<HTMLButtonElement>(null)
  const priorityTriggerRef = useRef<HTMLButtonElement>(null)
  // The control the last gesture came from: it gets the focus back if the
  // refresh leaves it on the page
  const lastControl = useRef<React.RefObject<HTMLButtonElement> | null>(null)
  // Where the focus goes when the refresh removed that control (a colleague
  // took the contact meanwhile): the heading of the card, always rendered,
  // while the read-only state may still wait for the operator's name
  const headingRef = useRef<HTMLHeadingElement>(null)

  // From the call until the refreshed contact is rendered
  const { pending, start, fail, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed(() => {
      const control = lastControl.current
      lastControl.current = null
      if (!control || !focusIsLost()) return
      const target = control.current ?? headingRef.current
      target?.focus()
    })
  const { onError } = useContactMutationFeedback({ refresh })
  const changeState = api.task.changeState.useMutation()
  const setPriority = api.task.setPriority.useMutation()
  // The change waiting for the user to confirm closing the open alert (P10)
  const [confirmation, setConfirmation] = useState<{
    state: TaskStatus
    alert: PendingAlert
  } | null>(null)

  const submitState = (state: TaskStatus, confirmedAlertId: number | null) => {
    lastControl.current = stateTriggerRef
    start()
    changeState.mutate(
      { taskId: task.id, toState: state, source: "detail", confirmedAlertId },
      {
        onSuccess: finishAfterRefresh,
        onError: (error) => {
          const result = onError(error)
          if (result) {
            // An open alert to confirm (AC36), maybe set meanwhile by a
            // colleague (AC37): nothing changed, the modal asks
            fail()
            lastControl.current = null
            setConfirmation({ state, alert: result.alert })
            return
          }
          // The toast gives the reason, the refresh shows the saved value
          awaitRefresh()
        },
      }
    )
  }

  const submitPriority = (priority: PriorityChoice) => {
    lastControl.current = priorityTriggerRef
    start()
    setPriority.mutate(
      { taskId: task.id, priority },
      {
        onSuccess: finishAfterRefresh,
        onError: (error) => {
          // No confirmation exists for the priority (`onError` returns null):
          // the toast gives the reason and the refresh shows the saved value
          onError(error)
          awaitRefresh()
        },
      }
    )
  }

  const priorityBand = bandOf(task.priority ?? 0)
  const priorityMode = task.customPriority ? "Manuale" : "Automatica"
  const state = task.state ?? "nessuno"

  const editability =
    actor && !operatorIsLoading
      ? contactEditability(actor, {
          isActive: true,
          taskOperator:
            task.operatorId === null
              ? null
              : {
                  id: task.operatorId,
                  name: operator?.name ?? null,
                  surname: operator?.surname ?? null,
                },
          customer,
        })
      : null

  const controls = () => {
    // Until the signed-in user is known nothing is interactive
    if (!editability) {
      return (
        <>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Stato</span>
            <TaskStatusBadge status={state} />
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Priorità</span>
            <PriorityBadge priority={task.priority ?? 0} />
          </div>
        </>
      )
    }

    // Read-only: the saved state and priority stay visible, with the reason
    // (AC51)
    if (editability.kind !== "editable") {
      return (
        <>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Stato</span>
            <TaskStatusBadge status={state} />
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Priorità</span>
            <div className="flex items-center gap-2 text-sm">
              <PriorityBadge priority={task.priority ?? 0} />
              <span>{bandLabels[priorityBand]}</span>
              <span className="text-muted-foreground">{priorityMode}</span>
            </div>
          </div>
          <div className="col-span-2 flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Modifica</span>
            <ReadOnlyReason
              editability={editability}
              customerUnassigned={props.customerOperatorId === null}
            />
          </div>
        </>
      )
    }

    return (
      <>
        <div className="flex flex-col items-start gap-1">
          <span className="text-sm font-medium">Stato</span>
          <ContactStateSelect
            aria-label="Stato"
            value={task.state}
            pending={pending}
            triggerRef={stateTriggerRef}
            onChange={(next) => {
              if (pending) return
              submitState(next, null)
            }}
          />
          <AlertCloseConfirmDialog
            alert={confirmation?.alert ?? null}
            returnFocusRef={stateTriggerRef}
            onCancel={() => setConfirmation(null)}
            onConfirm={(alertId) => {
              if (!confirmation) return
              setConfirmation(null)
              submitState(confirmation.state, alertId)
            }}
          />
        </div>
        <PrioritySelect
          band={priorityBand}
          mode={priorityMode}
          pending={pending}
          triggerRef={priorityTriggerRef}
          onChange={(next) => {
            if (pending) return
            submitPriority(next)
          }}
        />
      </>
    )
  }

  return (
    <div className="mt-8 rounded-md border bg-white p-4">
      <h2 ref={headingRef} tabIndex={-1} className="mb-2 text-lg font-medium">
        Stato del cliente
      </h2>
      <div className="grid grid-cols-4 items-start gap-4">
        {controls()}
        <div className="flex flex-col items-start gap-1">
          <span className="text-sm font-medium">Contattato il</span>
          <p className="flex h-10 items-center text-sm">
            {formatDeadline(task.closedAt ?? undefined, {
              precision: "hour",
            }) ?? "Mai Contattato"}
          </p>
        </div>
        {operator ? (
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium">Ultimo Contatto</span>
            <p className="flex h-10 items-center text-sm">
              {operator.name} {operator.surname}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The priority of the contact (AC42, AC43): the four bands and "Automatica".
 * It shows the saved band and whether it was set by hand ("Manuale") or by the
 * cron ("Automatica"). While a save is running the trigger ignores
 * interaction but stays focusable: `disabled` would drop the focus.
 */
function PrioritySelect(props: {
  band: PriorityBand
  mode: "Manuale" | "Automatica"
  pending: boolean
  triggerRef: React.RefObject<HTMLButtonElement>
  onChange: (choice: PriorityChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const value: PriorityChoice = props.mode === "Automatica" ? AUTO : props.band

  return (
    <div className="flex flex-col items-start gap-1">
      <Label htmlFor="contact-priority">Priorità</Label>
      <Select
        value={value}
        // While pending the menu can't open (pointer, Enter, Space, arrows all
        // go through here)
        open={open && !props.pending}
        onOpenChange={(next) => {
          if (!props.pending) setOpen(next)
        }}
        onValueChange={(next) => {
          if (props.pending || !isPriorityChoice(next) || next === value) return
          props.onChange(next)
        }}
      >
        <SelectTrigger
          id="contact-priority"
          ref={props.triggerRef}
          className="bg-white"
          aria-busy={props.pending}
          aria-disabled={props.pending}
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <PriorityBadge priority={bandValue(props.band)} />
              {bandLabels[props.band]}
              {props.pending ? (
                <LoadingSpinner className="h-4 w-4 shrink-0 motion-reduce:animate-none" />
              ) : null}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {priorityBands.map((band) => (
            <SelectItem key={band} value={band}>
              <span className="flex items-center gap-2">
                <PriorityBadge priority={bandValue(band)} />
                {bandLabels[band]}
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={AUTO}>Automatica</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{props.mode}</p>
    </div>
  )
}
