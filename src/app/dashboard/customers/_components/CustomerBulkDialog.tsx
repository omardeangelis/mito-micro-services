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
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ArrowLeft,
  Circle,
  CircleCheck,
  LoaderCircle,
  Phone,
  TriangleAlert,
  Users,
} from "lucide-react"
import { customerBulkUpdateAction } from "../_actions/customerBulkUpdate"
import { taskStatus } from "@/server/db/schema/task"
import { splitArray } from "@/app/api/import/_utils"

const SPLIT_SIZE = 30

type BulkType = "chiamate" | "clienti"

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
  const setDefaultTabValue = useCustomerTableStore.use.setDefaultTabValue()
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [mode, setMode] = useState<BulkType | null>(null)
  const [alertsToResolve, setAlertsToResolve] = useState<
    Record<string, boolean>
  >({})
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

  // Carica i clienti selezionati che hanno un alert attivo: solo nel flusso
  // "chiamate", dove la creazione di una nuova chiamata può sovrascriverne lo stato.
  const { data: customersWithAlert, isLoading: isLoadingAlerts } =
    api.task.getCustomersWithActiveAlerts.useQuery(
      { customerIds },
      { enabled: mode === "chiamate" && customerIds.length > 0 }
    )

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

  const resetState = React.useCallback(() => {
    form.reset()
    setMode(null)
    setAlertsToResolve({})
    setSuccess(false)
    setPending(false)
  }, [form])

  const onSuccessClose = React.useCallback(() => {
    resetState()
    setIsDialogOpen(false)
    props.onClose()
  }, [resetState, setIsDialogOpen, props])

  const chooseMode = (nextMode: BulkType) => {
    setMode(nextMode)
    setDefaultTabValue(nextMode)
    form.setValue("type", nextMode, { shouldValidate: true })
  }

  const goBackToChoice = () => {
    setMode(null)
    setAlertsToResolve({})
  }

  const onSubmit = form.handleSubmit(async (data) => {
    setPending(true)
    setSuccess(false)
    const totalSize = Math.ceil(customerIds.length / SPLIT_SIZE)
    const splittedCustomers = splitArray(customerIds, totalSize)

    const resolveAlertCustomerIds = Object.entries(alertsToResolve)
      .filter(([, shouldResolve]) => shouldResolve)
      .map(([id]) => id)

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
      if (data.type === "chiamate" && resolveAlertCustomerIds.length) {
        formData.append(
          "resolveAlertCustomerIds",
          resolveAlertCustomerIds.join(",")
        )
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
      resetState()
    }
  }

  return (
    <Dialog onOpenChange={handleOpen} open={isDialogOpen}>
      {pending ? (
        <LoadingUpdate mode={mode ?? "chiamate"} />
      ) : success ? (
        <SuccessUpdate
          mode={mode ?? "chiamate"}
          count={customerIds.length}
          alertCount={customersWithAlert?.length ?? 0}
          resolvedCount={Object.values(alertsToResolve).filter(Boolean).length}
          operatorName={getOperatorName(Number(form.watch("operatorId")))}
          onClose={onSuccessClose}
        />
      ) : mode === null ? (
        <ModeChoice count={customerIds.length} onChoose={chooseMode} />
      ) : (
        <DialogContent className="max-w-xl bg-white">
          <DialogHeader>
            <button
              type="button"
              onClick={goBackToChoice}
              className="mb-1 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Cambia tipo di assegnazione
            </button>
            <DialogTitle>
              {mode === "chiamate"
                ? "Assegnazione Massiva delle Chiamate"
                : "Assegnazione Massiva dei Clienti"}
            </DialogTitle>
            <DialogDescription>
              {mode === "chiamate"
                ? "Crea una chiamata da fare per i clienti selezionati e li assegna all'operatore scelto."
                : "Assegna i clienti selezionati a un operatore, senza creare nuove chiamate né modificare lo stato delle chiamate esistenti."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex w-full flex-col items-stretch gap-4"
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
                                  "Seleziona operatore"}
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

              {mode === "chiamate" ? (
                <AlertResolveSection
                  isLoading={isLoadingAlerts}
                  customers={customersWithAlert ?? []}
                  alertsToResolve={alertsToResolve}
                  onToggle={(customerId, value) =>
                    setAlertsToResolve((prev) => ({
                      ...prev,
                      [customerId]: value,
                    }))
                  }
                />
              ) : null}

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
                className="self-end"
                disabled={disabled || pending}
                variant={disabled || pending ? "disabled" : "default"}
                type="submit"
              >
                {mode === "chiamate" ? "Assegna chiamate" : "Assegna clienti"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  )
}

type CustomerWithAlert = {
  customerId: string | null
  name: string | null
  surname: string | null
  alertId: number
  deadline: Date
  message: string | null
}

const AlertResolveSection = (props: {
  isLoading: boolean
  customers: CustomerWithAlert[]
  alertsToResolve: Record<string, boolean>
  onToggle: (customerId: string, value: boolean) => void
}) => {
  if (props.isLoading) {
    return <Skeleton className="h-16 w-full" />
  }

  if (!props.customers.length) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Alert variant="info">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>
          {props.customers.length} cliente/i selezionati hanno un alert attivo
        </AlertTitle>
        <AlertDescription>
          Spunta i clienti per cui creare una nuova chiamata e risolvere
          l&apos;alert. Quelli non spuntati manterranno stato e alert: cambierà
          solo l&apos;operatore.
        </AlertDescription>
      </Alert>
      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border p-2">
        {props.customers.map((customer) => {
          const id = customer.customerId ?? ""
          const checked = props.alertsToResolve[id] ?? false
          const inputId = `alert-resolve-${customer.alertId}`
          return (
            <div
              key={customer.alertId}
              className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-muted"
            >
              <label htmlFor={inputId} className="flex cursor-pointer flex-col">
                <span className="text-sm font-medium">
                  {customer.name ?? "—"} {customer.surname ?? ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  Richiamo: {formatDeadline(customer.deadline)}
                  {customer.message ? ` · ${customer.message}` : ""}
                </span>
              </label>
              <label
                htmlFor={inputId}
                className="flex shrink-0 cursor-pointer items-center gap-2 text-xs"
              >
                <span
                  className={checked ? "text-red-500" : "text-muted-foreground"}
                >
                  Risolvi alert
                </span>
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(value) =>
                    props.onToggle(id, value === true)
                  }
                />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const formatDeadline = (deadline: Date) => {
  const date = deadline instanceof Date ? deadline : new Date(deadline)
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const ModeChoice = (props: {
  count: number
  onChoose: (mode: BulkType) => void
}) => {
  return (
    <DialogContent className="max-w-xl bg-white">
      <DialogHeader>
        <DialogTitle>Cosa vuoi assegnare?</DialogTitle>
        <DialogDescription>
          {props.count} cliente/i selezionati. Scegli il tipo di assegnazione
          massiva.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => props.onChoose("chiamate")}
          className="h-full text-left"
        >
          <Card className="flex h-full cursor-pointer flex-col gap-2 p-5 transition-colors hover:border-primary hover:bg-muted/50">
            <Phone className="h-6 w-6 text-primary" />
            <span className="text-base font-semibold">Assegna Chiamate</span>
            <span className="text-sm text-muted-foreground">
              Crea una chiamata da fare per ogni cliente e lo assegna
              all&apos;operatore.
            </span>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => props.onChoose("clienti")}
          className="h-full text-left"
        >
          <Card className="flex h-full cursor-pointer flex-col gap-2 p-5 transition-colors hover:border-primary hover:bg-muted/50">
            <Users className="h-6 w-6 text-primary" />
            <span className="text-base font-semibold">Assegna Clienti</span>
            <span className="text-sm text-muted-foreground">
              Assegna solo il cliente a un operatore, senza creare nuove
              chiamate.
            </span>
          </Card>
        </button>
      </div>
    </DialogContent>
  )
}

// Step puramente illustrativi: avanzano a tempo per dare percezione di
// progresso, NON sono collegati allo stato reale della mutation.
const LOADING_STEPS: Record<BulkType, string[]> = {
  chiamate: [
    "Verifica dei clienti selezionati",
    "Assegnazione all'operatore",
    "Creazione delle chiamate",
    "Aggiornamento degli alert",
    "Salvataggio delle modifiche",
  ],
  clienti: [
    "Verifica dei clienti selezionati",
    "Assegnazione all'operatore",
    "Salvataggio delle modifiche",
  ],
}

const LoadingUpdate = (props: { mode: BulkType }) => {
  const steps = LOADING_STEPS[props.mode]
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev))
    }, 900)
    return () => clearInterval(interval)
  }, [steps.length])

  return (
    <DialogContent className="max-w-md bg-white">
      <DialogHeader>
        <DialogTitle>
          {props.mode === "chiamate"
            ? "Assegnazione chiamate in corso"
            : "Assegnazione clienti in corso"}
        </DialogTitle>
        <DialogDescription>
          Attendere il completamento dell&apos;operazione...
        </DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-3 py-2">
        {steps.map((step, index) => {
          const isDone = index < activeStep
          const isActive = index === activeStep
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {isDone ? (
                  <CircleCheck className="h-5 w-5 text-success" />
                ) : isActive ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
              </span>
              <span
                className={
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {step}
              </span>
            </li>
          )
        })}
      </ul>
    </DialogContent>
  )
}

const SuccessUpdate = (props: {
  mode: BulkType
  count: number
  alertCount: number
  resolvedCount: number
  operatorName: string
  onClose: () => void
}) => {
  const isChiamate = props.mode === "chiamate"
  return (
    <DialogContent className="max-w-md bg-white">
      <DialogHeader className="items-center text-center">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CircleCheck className="h-8 w-8 text-success" />
        </div>
        <DialogTitle className="text-xl">
          {isChiamate ? "Chiamate assegnate" : "Clienti assegnati"}
        </DialogTitle>
        <DialogDescription>
          {isChiamate
            ? `${props.count} chiamata/e create${props.operatorName ? ` e assegnate a ${props.operatorName}` : ""}.`
            : `${props.count} cliente/i assegnati${props.operatorName ? ` a ${props.operatorName}` : ""}.`}
        </DialogDescription>
      </DialogHeader>

      {isChiamate && props.alertCount > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Alert risolti</span>
            <span className="font-semibold text-foreground">
              {props.resolvedCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Alert mantenuti</span>
            <span className="font-semibold text-foreground">
              {Math.max(props.alertCount - props.resolvedCount, 0)}
            </span>
          </div>
        </div>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" className="w-full" onClick={props.onClose}>
            Chiudi
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}
