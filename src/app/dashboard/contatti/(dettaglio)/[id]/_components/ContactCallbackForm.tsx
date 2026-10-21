"use client"

import * as React from "react"
import { PlusSquare } from "lucide-react"
import { useForm } from "react-hook-form"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import {
  type PendingAlert,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { canSetCallback } from "@mito/domain/contact/status"
import { isDueOrOverdue } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { formatDeadline } from "@/lib/utils/format"
import { api } from "@/trpc/react"
import { detailHrefFromDa } from "../../../_lib/detailHrefFromDa"
import { useContactSheet } from "../../_components/ContactSheet"

type Props = {
  taskId: number
  /** The saved state: "Imposta richiamo" exists only with an outcome or none */
  state: TaskStatus | null
  /** The open alert of the contact: the one the form replaces */
  alert: PendingAlert | null
  /** The `da` parameter of the address: the list state to carry along */
  da?: string | undefined
}

type FormValues = {
  deadline: Date | undefined
  message: string
}

/**
 * "Imposta richiamo" in the detail (AC44, AC45): the form of the Prossimo
 * alert section. It calls `setCallback` and waits with
 * `useSavingUntilRefreshed`, as the other controls of the contact do.
 * It is mounted for an editable contact only, and renders nothing unless the
 * state has an outcome or is `nessuno` (AC46).
 *
 * - From tomorrow on: today and the past days are not offered, by the Rome
 *   day (D22). The form itself is the confirmation (AC44).
 * - The form names the open alert it replaces. If the server says the open
 *   alert is another one (a colleague set it meanwhile), nothing was saved,
 *   the form stays open with the data, with no toast, and names the current
 *   one; saving again replaces that one.
 * - Any other rejection is a toast, said also inside the sheet (the toast
 *   region is hidden to assistive technology while the sheet is open), and
 *   the refresh that shows the saved value; the form stays open to retry.
 * - The wait lasts from the call until the refreshed page is on screen; a
 *   second submit is ignored meanwhile (AC39).
 */
export function ContactCallbackForm({ taskId, state, alert, da }: Props) {
  const sheet = useContactSheet()
  const form = useForm<FormValues>({ defaultValues: { message: "" } })

  const { pending, start, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed()
  const activeContactHref = React.useCallback(
    (activeTaskId: number) => detailHrefFromDa(activeTaskId, da),
    [da]
  )
  const { onError } = useContactMutationFeedback({ refresh, activeContactHref })
  const setCallback = api.task.setCallback.useMutation()

  const [open, setOpen] = React.useState(false)
  // The open alert the form replaces when the server says it is another one
  // than the page showed (AC44)
  const [received, setReceived] = React.useState<PendingAlert | null>(null)
  const replaced = received ?? alert

  if (!canSetCallback(state)) return null

  const submit = (event: React.BaseSyntheticEvent) => {
    event.preventDefault()
    if (pending) return
    void form.handleSubmit((values) => {
      if (!values.deadline) return
      start()
      const message = values.message.trim()
      // `mutateAsync` settles after an unmount, the per-call callbacks of
      // `mutate` don't: the toast and the refresh must still run
      setCallback
        .mutateAsync({
          taskId,
          deadline: values.deadline,
          message: message === "" ? null : message,
          replacesAlertId: replaced?.id ?? null,
        })
        .then(
          () => {
            setOpen(false)
            setReceived(null)
            form.reset({ deadline: undefined, message: "" })
            finishAfterRefresh()
          },
          (error) => {
            const rejected = onError(error)
            if (rejected) {
              // Another open alert than the form said (AC44): nothing was
              // saved, the form stays open with the data and names it
              setReceived(rejected.alert)
              finishAfterRefresh()
              return
            }
            // The toast gives the reason, and the toast region is hidden to
            // assistive technology while the sheet is open: say it inside
            sheet.announceAlert(describeContactError(error))
            // The refresh `onError` started shows the saved value
            awaitRefresh()
          }
        )
    })(event)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setReceived(null)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-2" data-callback-trigger="">
          <PlusSquare size={16} aria-hidden="true" />
          Imposta richiamo
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-20 bg-white p-4">
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {/* Always mounted: an alert a colleague sets while the form is
                open fills it, and a region that arrives with its content is
                not always announced */}
            <div className="text-sm text-gray-600" role="status">
              {replaced ? (
                <>
                  <p className="font-medium">
                    Sostituisce il richiamo del{" "}
                    {formatDeadline(replaced.deadline)}
                  </p>
                  {replaced.message ? (
                    // Scrolls inside the form, so a long message never pushes
                    // the buttons out; focusable, so the keyboard can scroll it
                    <p
                      role="region"
                      aria-label="Messaggio del richiamo"
                      tabIndex={0}
                      className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-xs [overflow-wrap:anywhere]"
                    >
                      {replaced.message}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <DatePickerFormItem
                  fieldValue={field.value}
                  onChange={field.onChange}
                  label="Imposta scadenza"
                  disabled={(date) => isDueOrOverdue(date, new Date())}
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
                      aria-label="Messaggio"
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
              Salva richiamo
            </Button>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  )
}
