"use client"
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useRefreshAfterSave } from "@/components/custom/contact/useRefreshAfterSave"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { type Alert as AlertType, type Task } from "@/lib/types/schemas"
import { Clock, PlusSquare, AlarmClock, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getTimeDifferenceFromNowAsDD } from "@/lib/utils"
import { type BaseSyntheticEvent, useEffect, useRef, useState } from "react"
import { formatDeadline } from "@/lib/utils/format"
import { contactEditability } from "@/lib/domain/contact/permissions"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { api } from "@/trpc/react"

type Props = {
  task: {
    id: Task["id"]
    /** The contact's operator. */
    operatorId: Task["operatorId"]
  }
  /** The customer's operator, which can differ from the contact's (D2, A1). */
  customerOperatorId: number | null
  alert?: AlertType
  /** "Imposta richiamo" is available in this state (AC46). */
  creatable: boolean
}

const formSchema = z.object({
  deadline: z.date(),
  message: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

/**
 * The open alert of the contact ("Prossimo alert") and "Imposta richiamo"
 * (AC44, AC45). Both go through the contact mutations, from the client, so
 * the rejections reach the interface with their reason (AC52). Neither
 * changes the screen before the server answers: the wait lasts until the
 * refreshed value is on screen.
 */
export const CustomerAlertCreator = (props: Props) => {
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const actor =
    role !== undefined && operatorId !== undefined ? { role, operatorId } : null

  const form = useForm<FormValues>({
    defaultValues: {
      message: "",
    },
  })

  const { refresh, refreshing } = useRefreshAfterSave()
  const { onError } = useContactMutationFeedback({ refresh })
  const setCallback = api.task.setCallback.useMutation()
  const resolveAlert = api.task.resolveAlert.useMutation()

  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // The open alert the form replaces when the server says it is another one
  // than the page showed (AC44)
  const [received, setReceived] = useState<PendingAlert | null>(null)

  // From the call until the refreshed contact is rendered
  const [saving, setSaving] = useState(false)
  const pending = saving || refreshing
  // The server answered and the refresh started: its end closes the wait
  const awaitingRefresh = useRef(false)
  // The alert was closed with the "X": the focus goes to the trigger when the
  // refreshed page is on screen
  const focusTriggerAfter = useRef(false)

  useEffect(() => {
    if (refreshing || !awaitingRefresh.current) return
    awaitingRefresh.current = false
    setSaving(false)
    if (focusTriggerAfter.current) {
      focusTriggerAfter.current = false
      triggerRef.current?.focus()
    }
  }, [refreshing])

  const openAlert = props.alert && !props.alert.isResolved ? props.alert : null
  const replaced: PendingAlert | null = received ?? openAlert

  const submit = (e: BaseSyntheticEvent) => {
    e.preventDefault()
    if (pending) return
    void form.handleSubmit((values) => {
      setSaving(true)
      setCallback.mutate(
        {
          taskId: props.task.id,
          deadline: values.deadline,
          message: values.message,
          replacesAlertId: replaced?.id ?? null,
        },
        {
          onSuccess: () => {
            awaitingRefresh.current = true
            setOpen(false)
            setReceived(null)
            form.reset({ deadline: undefined, message: "" })
            refresh()
          },
          onError: (error) => {
            const result = onError(error)
            if (result) {
              // Another open alert than the form said (AC44): nothing was
              // saved, the form stays open with the data and names it
              setReceived(result.alert)
              awaitingRefresh.current = true
              refresh()
              return
            }
            // The toast gives the reason, the refresh shows the saved value
            awaitingRefresh.current = true
          },
        }
      )
    })(e)
  }

  const closeAlert = (alertId: number) => {
    if (pending) return
    setSaving(true)
    resolveAlert.mutate(
      { alertId, source: "detail" },
      {
        onSuccess: () => {
          awaitingRefresh.current = true
          focusTriggerAfter.current = true
          setReceived(null)
          refresh()
        },
        onError: (error) => {
          // The alert stays: the toast gives the reason and the refresh shows
          // the saved value
          if (onError(error)) setSaving(false)
          else awaitingRefresh.current = true
        },
      }
    )
  }

  const editability = actor
    ? contactEditability(actor, {
        isActive: true,
        taskOperator:
          props.task.operatorId === null
            ? null
            : { id: props.task.operatorId, name: null, surname: null },
        customer: { operatorId: props.customerOperatorId },
      })
    : null
  // Until the signed-in user is known nothing is interactive
  const editable = editability?.kind === "editable"

  return (
    <>
      {props.alert ? (
        <Alert
          variant={props.alert.isResolved ? "destructive" : "info"}
          className="flex justify-between"
        >
          <div className="flex items-center gap-4">
            {props.alert.isResolved ? (
              <AlarmClock className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            <div>
              {props.alert.isResolved ? (
                <AlertTitle className="mb-0">
                  Scaduto il {formatDeadline(props.alert.deadline)}
                </AlertTitle>
              ) : (
                <AlertTitle>
                  Scade {getTimeDifferenceFromNowAsDD(props.alert.deadline)}{" "}
                </AlertTitle>
              )}
              {props.alert.message ? (
                <AlertDescription>{props.alert.message}</AlertDescription>
              ) : null}
            </div>
          </div>
          {editable && openAlert ? (
            <Button
              type="button"
              size="sm"
              variant={"ghost"}
              aria-label="Chiudi il richiamo"
              aria-busy={pending}
              aria-disabled={pending}
              onClick={() => closeAlert(openAlert.id)}
            >
              {pending && resolveAlert.isLoading ? (
                <LoadingSpinner className="h-4 w-4 shrink-0 motion-reduce:animate-none" />
              ) : (
                <X size={20} />
              )}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {editable && props.creatable ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) setReceived(null)
            setOpen(next)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              ref={triggerRef}
              size="sm"
              className="absolute right-4 top-4 gap-2"
            >
              <PlusSquare size={16} />
              Imposta richiamo
            </Button>
          </PopoverTrigger>
          <PopoverContent className="min-w-20 bg-white p-4">
            <Form {...form}>
              <form className="flex flex-col gap-4" onSubmit={submit}>
                {replaced ? (
                  <div className="text-sm text-gray-600" role="status">
                    <p className="font-medium">
                      Sostituisce il richiamo del{" "}
                      {formatDeadline(replaced.deadline)}
                    </p>
                    {replaced.message ? <p>{replaced.message}</p> : null}
                  </div>
                ) : null}
                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <DatePickerFormItem
                      fieldValue={field.value}
                      onChange={field.onChange}
                      label="Imposta scadenza"
                      disabled={(date) => {
                        const now = new Date(
                          new Date().toLocaleString("en-US", {
                            timeZone: "Europe/Rome",
                          })
                        )
                        return date < now
                      }}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Messaggio"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={!form.watch("deadline")}
                  aria-busy={pending}
                  aria-disabled={pending}
                >
                  Setta alert
                </Button>
              </form>
            </Form>
          </PopoverContent>
        </Popover>
      ) : null}
      {!props.alert && editable && !props.creatable ? (
        <p className="text-sm italic text-gray-500">
          Solo i clienti che non sono da chiamare possono avere alert.
        </p>
      ) : null}
      {!props.alert && !editable ? (
        <p className="text-sm italic text-gray-500">Nessun alert attivo.</p>
      ) : null}
    </>
  )
}
