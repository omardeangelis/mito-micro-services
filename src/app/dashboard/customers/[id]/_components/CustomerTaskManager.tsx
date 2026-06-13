"use client"

import { type Operator, type Task, selectTaskSchema } from "@/lib/types/schemas"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  SelectContent,
  SelectLabel,
  SelectValue,
  Select,
  SelectGroup,
  SelectTrigger,
  SelectItem,
} from "@/components/ui/select"
import { convertNullToUndefined } from "@/lib/utils/form"
import { taskStatus } from "@/server/db/schema/task"
import {
  PriorityBadge,
  priorityEnum,
  priorityRangeMap,
} from "@/components/custom/badge/priority"
import { Button } from "@/components/ui/button"
import { api } from "@/trpc/react"
import { useEffect, useState } from "react"
import { getTaskStatusDirection } from "../../_utils"
import { useRouter } from "next/navigation"
import { formatDeadline } from "@/lib/utils/format"

const schema = selectTaskSchema
  .pick({
    id: true,
    state: true,
    priority: true,
    customPriority: true,
  })
  .merge(
    z.object({
      priority: z.string(),
    })
  )

type TaskFormValues = z.infer<typeof schema>

const resolver = zodResolver(schema)

type TaskManager = {
  tasks: Task[]
}

export const CustomerTaskManager = (props: TaskManager) => {
  const [task, setTask] = useState<Task | null>(props.tasks[0]!)
  const [operator, setOperator] = useState<Operator | null>(null)
  const { data: operatorData, isLoading: operatorIsLoading } =
    api.operator.getOperatorById.useQuery({
      id: task?.operatorId ?? undefined,
    })

  const availableTaskStatus = taskStatus.filter((s) => {
    if (task?.state === "followup") return s !== "chiamare"
    return s !== "followup"
  })
  const router = useRouter()
  const apiUtils = api.useUtils()
  const {
    data,
    isLoading,
    isSuccess: isUpdateSuccess,
    mutateAsync: updateTask,
    reset: resetUpdateTask,
  } = api.task.updateTaskFromDashboard.useMutation()
  const {
    data: newData,
    isLoading: newTaskIsLoading,
    isSuccess: isNewTaskSuccess,
    mutateAsync: createTask,
    reset: resetCreateTask,
  } = api.task.createTask.useMutation()
  const { mutateAsync: resolveAlerts } = api.task.resolveAlerts.useMutation()
  const form = useForm<TaskFormValues>({
    resolver,
    defaultValues: {
      id: task?.id,
      state: task?.state,
      priority: task?.priority?.toString() ?? undefined,
      customPriority: task?.customPriority,
    },
  })

  const { data: activeTask } = api.task.getActiveTask.useQuery({
    id: task!.customerId!,
  })

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.state === "chiamare" && values.state !== task?.state) {
      await createTask({
        customerId: task?.customerId,
        operatorId: task?.operatorId,
        state: values.state,
        closedAt: task?.closedAt,
      })
      await updateTask({
        id: activeTask?.[0]?.id,
        isActive: false,
      })
    } else {
      const direction = getTaskStatusDirection(task!.state!, values.state!)
      await updateTask({
        id: task?.id,
        state: values.state,
        priority: values.customPriority ? Number(values.priority) : 120,
        customPriority: values.customPriority,
        isClosed: direction === "close" ? true : false,
      })
    }
    if (
      task?.alertId &&
      task.state === "richiamare" &&
      task.state !== values.state
    ) {
      // Non eliminiamo l'alert: lo segniamo risolto e lo sganciamo, così resta
      // recuperabile invece di essere cancellato per sempre dal DB.
      await resolveAlerts({
        id: task.alertId,
      })
    }
    router.refresh()
    await apiUtils.task.getActiveTask.invalidate()
  })

  useEffect(() => {
    const incoming = props.tasks[0]
    if (!incoming) return
    if (
      incoming.id !== task?.id ||
      incoming.state !== task?.state ||
      incoming.alertId !== task?.alertId
    ) {
      setTask(incoming)
      form.reset({
        id: incoming.id,
        state: incoming.state,
        priority: incoming.priority?.toString() ?? undefined,
        customPriority: incoming.customPriority,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tasks])

  useEffect(() => {
    if (isUpdateSuccess && data) {
      setTask(data)
      form.reset({
        state: data.state,
        customPriority: data.customPriority,
        priority: data.priority?.toString(),
      })
      resetCreateTask()
      resetUpdateTask()
    } else if (isNewTaskSuccess && newData) {
      setTask(newData)
      form.reset({
        state: newData.state,
        customPriority: newData.customPriority,
        priority: newData.priority?.toString(),
      })
      resetUpdateTask()
      resetCreateTask()
    }
  }, [
    isUpdateSuccess,
    isNewTaskSuccess,
    task,
    form,
    data,
    newData,
    resetUpdateTask,
    resetCreateTask,
  ])

  useEffect(() => {
    if (operatorData && !operatorIsLoading) {
      setOperator(operatorData)
    }
  }, [operatorData, operatorIsLoading])

  const isSubmitDisabled =
    form.formState.isSubmitting || isLoading || newTaskIsLoading
  return (
    <div className="mt-8 rounded-md border bg-white p-4">
      <h2 className="mb-2 text-lg font-medium">Stato del cliente</h2>
      <Form {...form}>
        <form className="flex items-end justify-between" onSubmit={onSubmit}>
          <div className="grid grid-cols-4 items-end gap-4">
            <FormField
              control={form.control}
              name="id"
              render={({ field }) => {
                return (
                  <FormItem hidden>
                    <FormControl>
                      <Input {...field} type="hidden" />
                    </FormControl>
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field: { ref: _, ...field } }) => (
                <FormItem className="w-full bg-white">
                  <FormLabel>Stato</FormLabel>
                  <Select
                    {...field}
                    onValueChange={field.onChange}
                    value={field.value ?? undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-white">
                        <SelectValue>
                          {field.value
                            ? convertNullToUndefined(field.value)
                            : "Seleziona Stato"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Stato</SelectLabel>
                        {availableTaskStatus.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            <>
              <FormField
                control={form.control}
                name="priority"
                render={({ field: { ref: _, ...field } }) => (
                  <FormItem className="w-full bg-white">
                    <FormLabel>Priorità</FormLabel>
                    <Select
                      {...field}
                      onValueChange={(value) => {
                        field.onChange(value)
                        form.setValue("customPriority", true)
                      }}
                      value={field.value ?? undefined}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white">
                          <SelectValue>
                            <PriorityBadge priority={Number(field.value)} />
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Priorità</SelectLabel>
                          {priorityEnum.map((priority) => (
                            <SelectItem
                              key={priority}
                              value={priorityRangeMap[priority].toString()}
                            >
                              <span className="mr-2">{priority}</span>
                              <PriorityBadge
                                priority={priorityRangeMap[priority]}
                              />
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </>
            <FormField
              defaultValue={formatDeadline(task?.closedAt ?? undefined, {
                precision: "hour",
              })}
              name="closedAt"
              disabled
              render={({ field }) => (
                <FormItem className="w-full bg-white">
                  <FormLabel>Contattato il</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Mai Contattato" />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            {operator && (
              <FormField
                defaultValue={`${operator?.name} ${operator?.surname}`}
                name="operatorId"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full bg-white">
                    <FormLabel>Ultimo Contatto</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Mai Contattato" />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            )}
          </div>
          <Button type="submit" disabled={isSubmitDisabled}>
            Salva
          </Button>
        </form>
      </Form>
    </div>
  )
}
