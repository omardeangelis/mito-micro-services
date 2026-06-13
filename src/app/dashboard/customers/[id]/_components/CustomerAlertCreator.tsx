"use client"
import { DatePickerFormItem } from "@/components/custom/date-picker"
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
import { createAlertAction, deleteAlertAction } from "../_actions/createAlert"
import {
  type BaseSyntheticEvent,
  useCallback,
  useOptimistic,
  useState,
} from "react"
import { formatDeadline } from "@/lib/utils/format"
import { useRouter } from "next/navigation"

type Props = {
  task: {
    id: Task["id"]
  }
  alert?: AlertType
  lastAlertId: AlertType["id"]
  creatable: boolean
}

const formSchema = z.object({
  deadline: z.date(),
  message: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export const CustomerAlertCreator = (props: Props) => {
  const router = useRouter()
  const form = useForm<FormValues>({
    defaultValues: {
      message: "",
    },
  })

  const [optimisticAlert, createOptimisticAlert] = useOptimistic(
    props.alert,
    (_, newState: AlertType | undefined) => newState
  )

  const [open, setOpen] = useState(false)
  const submit = useCallback(
    async (e: BaseSyntheticEvent) => {
      e.preventDefault()
      setOpen(false)
      await form.handleSubmit(async (values) => {
        createOptimisticAlert({
          deadline: values.deadline,
          message: values.message ?? null,
          taskId: props.task.id,
          id: props.lastAlertId + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isResolved: false,
        })
        await createAlertAction({
          deadline: values.deadline,
          message: values.message,
          taskId: props.task.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        router.refresh()
      })(e)
    },
    [createOptimisticAlert, form, props.lastAlertId, props.task.id, router]
  )

  const deleteAlert = useCallback(
    async (id: number) => {
      createOptimisticAlert(undefined)
      await deleteAlertAction(id)
    },
    [createOptimisticAlert]
  )

  if (optimisticAlert) {
    return (
      <Alert
        variant={optimisticAlert.isResolved ? "destructive" : "info"}
        className="flex justify-between"
      >
        <div className="flex items-center gap-4">
          {optimisticAlert.isResolved ? (
            <AlarmClock className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          <div>
            {optimisticAlert.isResolved ? (
              <AlertTitle className="mb-0">
                Scaduto il {formatDeadline(optimisticAlert.deadline)}
              </AlertTitle>
            ) : (
              <AlertTitle>
                Scade {getTimeDifferenceFromNowAsDD(optimisticAlert.deadline)}{" "}
              </AlertTitle>
            )}
            {optimisticAlert.message ? (
              <AlertDescription>{optimisticAlert.message}</AlertDescription>
            ) : null}
          </div>
        </div>
        <Button
          size="sm"
          variant={"ghost"}
          onClick={() => deleteAlert(optimisticAlert.id)}
        >
          <X size={20} />
        </Button>
      </Alert>
    )
  }
  return props.creatable ? (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild disabled={!props.creatable}>
        <Button
          size="icon"
          disabled={!props.creatable}
          className="absolute right-4 top-4"
          variant={!props.creatable ? "disabled" : "default"}
        >
          <PlusSquare size={24} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-20 bg-white p-4">
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={submit}>
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
            <Button type="submit" disabled={!form.watch("deadline")}>
              Setta alert
            </Button>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  ) : (
    <p className="text-sm italic text-gray-500">
      Solo i clienti che non sono da chiamare possono avere alert.
    </p>
  )
}
