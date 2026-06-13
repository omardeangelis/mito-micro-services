"use client"

import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/trpc/react"
import { Skeleton } from "@/components/ui/skeleton"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Input } from "@/components/ui/input"
import { customerBulkUpdateAction } from "../_actions/customerBulkUpdate"
import { taskStatus } from "@/server/db/schema/task"
import { splitArray } from "@/app/api/import/_utils"

const SPLIT_SIZE = 30

const formSchema = z
  .object({
    operatorId: z.string(),
    customerIds: z.string(),
    type: z.enum(["chiamate", "clienti"]).default("chiamate"),
    callType: z.enum(taskStatus).optional(),
  })
  .refine((data) => {
    if (data.type === "chiamate") {
      return data.callType !== undefined
    }
    return true
  })

type FormValues = z.infer<typeof formSchema>

type BulkActionDialogProps = {
  onClose: () => void
}

export const CustomerBulkDialog = (props: BulkActionDialogProps) => {
  const isDialogOpen = useCustomerTableStore.use.bulkActionDialogOpen()
  const setIsDialogOpen = useCustomerTableStore.use.setBulkActionDialogOpen()
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const form = useForm<FormValues>({
    mode: "all",
    defaultValues: {
      customerIds: customerIds.join(","),
      type: "chiamate",
      callType: "chiamare",
    },
    resolver: zodResolver(formSchema),
  })

  const { data: availableOperators, isLoading } =
    api.operator.getAllUniqueOperators.useQuery()

  const getOperatorName = React.useCallback(
    (id: number) => {
      const operator = availableOperators?.find((t) => t.id === id)
      return operator ? `${operator.name} ${operator.surname}` : ""
    },
    [availableOperators]
  )

  useEffect(() => {
    const unsub = useCustomerTableStore.subscribe((state) => {
      if (state.selectedCustomer.length) {
        setCustomerIds(state.selectedCustomer)
        form.setValue("customerIds", state.selectedCustomer.join(","))
      }
    })
    return () => unsub()
  })

  const disabled = !form.formState.isValid || pending

  const onSuccessClose = React.useCallback(() => {
    form.reset()
    setSuccess(false)
    props.onClose()
  }, [form, props])

  const onSubmit = form.handleSubmit(async (data) => {
    setPending(true)
    setSuccess(false)
    const totalSize = Math.ceil(customerIds.length / SPLIT_SIZE)
    const splittedCustomers = splitArray(customerIds, totalSize)

    const customersPromises = []

    for (const customerChunk of splittedCustomers) {
      const formData = new FormData()
      formData.append("customerIds", customerChunk.join(","))
      formData.append("type", data.type)
      if (data.operatorId) {
        formData.append("operatorId", data.operatorId)
      }
      if (data.callType) {
        formData.append("callType", data.callType)
      }
      customersPromises.push(customerBulkUpdateAction(formData))
    }
    try {
      await Promise.all(customersPromises)
      setSuccess(true)
    } catch (error) {
      console.error(error)
    } finally {
      setPending(false)
    }
  })

  const handleOpen = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      form.reset()
      setSuccess(false)
      setPending(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpen} open={isDialogOpen}>
      {pending ? (
        <LoadingUpdate />
      ) : success ? (
        <SuccessUpdate onClose={onSuccessClose} />
      ) : (
        <DialogContent className="max-w-xl bg-white">
          <DialogHeader>
            <DialogTitle>Assegnazione Massiva delle Chiamate</DialogTitle>
            <DialogDescription>
              Assegna contemporaneamente più chiamate da fare ad un unico
              operatore
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex w-full flex-col items-end gap-4"
              onSubmit={onSubmit}
            >
              {availableOperators && !isLoading ? (
                <>
                  <FormField
                    control={form.control}
                    name="operatorId"
                    render={({ field: { ref: _, ...field } }) => (
                      <FormItem className="w-full">
                        <FormLabel>Operatore</FormLabel>
                        <Select
                          {...field}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-white">
                              <SelectValue>
                                {getOperatorName(Number(field.value)) ||
                                  "Do not Edit"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Operatore</SelectLabel>
                              {availableOperators
                                .filter(
                                  (o) =>
                                    Number(form.watch("operatorId")) !== o.id
                                )
                                .map((operator) => (
                                  <SelectItem
                                    key={operator.id}
                                    value={operator.id.toString()}
                                  >
                                    {operator.name} {operator.surname}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="operatorId"
                    render={({ field: { ref: _, ...field } }) => (
                      <FormItem className="w-full" hidden>
                        <Input {...field} value={field.value} />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <Skeleton className="h-10 w-full" />
              )}
              <FormField
                name="customerIds"
                render={({ field }) => (
                  <FormItem hidden>
                    <FormControl>
                      <Input
                        name={field.name}
                        value={customerIds.join(",") ?? ""}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                name="type"
                render={({ field }) => (
                  <FormItem hidden>
                    <FormControl>
                      <Input
                        name={field.name}
                        value={form.watch("type") ?? "chiamate"}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button
                disabled={disabled || pending}
                variant={disabled || pending ? "disabled" : "default"}
                type="submit"
              >
                Modifica
              </Button>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  )
}

const LoadingUpdate = () => {
  const tabsDefaultValue =
    useCustomerTableStore.use.bulkDialagoDefaultTabValue()
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {tabsDefaultValue === "chiamate"
            ? "Assegnando Chiamate"
            : "Assegnando Clienti"}
        </DialogTitle>
        <DialogDescription>Attendere prego...</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-28 items-center justify-center">
        <LoadingSpinner />
      </div>
    </DialogContent>
  )
}

const SuccessUpdate = (props: BulkActionDialogProps) => {
  const setDialogOpen = useCustomerTableStore.use.setBulkActionDialogOpen()
  const closeDialog = React.useCallback(() => {
    props.onClose()
    setDialogOpen(false)
  }, [props, setDialogOpen])
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Operazione Completata</DialogTitle>
      </DialogHeader>
      <DialogFooter className="justify-end">
        <DialogClose asChild>
          <Button type="button" onClick={closeDialog}>
            Close
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}
