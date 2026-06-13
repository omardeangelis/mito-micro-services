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
import { useFormState, useFormStatus } from "react-dom"
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
import { usePracticeTableStore } from "@/store/usePracticeTableStore"
import { bulkUpdateAction } from "../_actions/bulkUpdateAction"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Input } from "@/components/ui/input"

const formSchema = z.object({
  operatorId: z.string().optional(),
  practiceIds: z.string(),
})

type FormValues = z.infer<typeof formSchema>

type BulkActionDialogProps = {
  onClose: () => void
}

export const BulkActionDialog = (props: BulkActionDialogProps) => {
  const isDialogOpen = usePracticeTableStore.use.bulkActionDialogOpen()
  const setIsDialogOpen = usePracticeTableStore.use.setBulkActionDialogOpen()
  const [practiceIds, setPracticeIds] = useState<string[]>([])

  const form = useForm<FormValues>({
    mode: "all",
    defaultValues: {
      operatorId: "",
      practiceIds: practiceIds.join(","),
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
    const unsub = usePracticeTableStore.subscribe((state) => {
      if (state.selectedPractice.length) {
        setPracticeIds(state.selectedPractice)
        form.setValue("practiceIds", state.selectedPractice.join(","))
      }
    })
    return () => unsub()
  })

  const disabled = !form.formState.isDirty || isLoading

  const [formState, formAction] = useFormState(bulkUpdateAction, {
    message: "",
    error: "",
  })
  const { pending } = useFormStatus()

  const onSuccessClose = React.useCallback(() => {
    form.reset()
    formState.message = ""
    formState.error = ""
    props.onClose()
  }, [form, formState, props])

  return (
    <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
      {pending ? (
        <LoadingUpdate />
      ) : formState.message ? (
        <SuccessUpdate onClose={onSuccessClose} />
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Edit</DialogTitle>
            <DialogDescription>
              Modifica contemporaneamente più pratiche
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              className="flex w-full flex-col items-end gap-4"
              action={formAction}
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
                name="practiceIds"
                render={({ field }) => (
                  <FormItem hidden>
                    <FormControl>
                      <Input {...field} defaultValue={practiceIds.join(",")} />
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
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Updating</DialogTitle>
        <DialogDescription>Updating practices...</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <LoadingSpinner />
      </DialogFooter>
    </DialogContent>
  )
}

const SuccessUpdate = (props: BulkActionDialogProps) => {
  const setDialogOpen = usePracticeTableStore.use.setBulkActionDialogOpen()
  const closeDialog = React.useCallback(() => {
    props.onClose()
    setDialogOpen(false)
  }, [props, setDialogOpen])
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Success</DialogTitle>
        <DialogDescription>Pratiche aggiornate con successo</DialogDescription>
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
