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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { type TaskStatus } from "@mito/contract/task"
import { Skeleton } from "@/components/ui/skeleton"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
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
import { useActiveOperators } from "@/api/operator"
import { useBulkAssignCustomers } from "@/api/customer"
import { useBulkHandleTask, useCustomersWithActiveAlerts } from "@/api/task"
import { splitArray } from "@/lib/utils"

// The calls of one assignment, at most, all in parallel: each takes a slice
// of the selected customers, as the server actions of the Next.js app did
const MAX_PARALLEL_CALLS = 30

// The state of the contacts "Crea/assegna contatti" creates
const CALL_TYPE: TaskStatus = "chiamare"

// Quello che "Assegna Clienti" fa alle chiamate già registrate: lo dicono sia
// la scheda di scelta sia la descrizione del dialogo.
const CLIENTI_EXPORT_NOTE =
  "Le chiamate già registrate sul contatto passano al nuovo operatore nell'export; i contatti non attivi restano a chi li ha lavorati."

type BulkType = "chiamate" | "clienti"

type BulkActionDialogProps = {
  onClose: () => void
}

export const CustomerBulkDialog = (props: BulkActionDialogProps) => {
  const isDialogOpen = useCustomerTableStore.use.bulkActionDialogOpen()
  const setIsDialogOpen = useCustomerTableStore.use.setBulkActionDialogOpen()
  const setDefaultTabValue = useCustomerTableStore.use.setDefaultTabValue()
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [mode, setMode] = useState<BulkType | null>(null)
  const [operatorId, setOperatorId] = useState("")
  const [alertsToResolve, setAlertsToResolve] = useState<
    Record<string, boolean>
  >({})
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const bulkHandleTask = useBulkHandleTask()
  const bulkAssignCustomers = useBulkAssignCustomers()

  const { data: availableOperators, isLoading } = useActiveOperators()

  // Carica i clienti selezionati che hanno un alert attivo: solo nel flusso
  // "chiamate", dove la creazione di un nuovo contatto può sovrascriverne lo stato.
  const { data: customersWithAlert, isLoading: isLoadingAlerts } =
    useCustomersWithActiveAlerts(customerIds, {
      enabled: mode === "chiamate" && customerIds.length > 0,
    })

  const getOperatorName = React.useCallback(
    (id: number) => {
      const operator = availableOperators?.find((t) => t.id === id)
      return operator ? operatorDisplayName(operator) : ""
    },
    [availableOperators]
  )

  useEffect(() => {
    const unsub = useCustomerTableStore.subscribe((state) => {
      if (state.selectedCustomer.length) {
        setCustomerIds(state.selectedCustomer)
      }
    })
    return () => unsub()
  })

  // An operator is required, as in the form of the Next.js app
  const disabled = operatorId === "" || pending

  const resetState = React.useCallback(() => {
    setOperatorId("")
    setMode(null)
    setAlertsToResolve({})
    setSuccess(false)
    setPending(false)
  }, [])

  const onSuccessClose = React.useCallback(() => {
    resetState()
    setIsDialogOpen(false)
    props.onClose()
  }, [resetState, setIsDialogOpen, props])

  const chooseMode = (nextMode: BulkType) => {
    setMode(nextMode)
    setDefaultTabValue(nextMode)
  }

  const goBackToChoice = () => {
    setMode(null)
    setAlertsToResolve({})
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || mode === null) return
    setPending(true)
    setSuccess(false)
    const sliceSize = Math.ceil(customerIds.length / MAX_PARALLEL_CALLS)
    const slices = splitArray(customerIds, sliceSize)

    const resolveAlertCustomerIds = Object.entries(alertsToResolve)
      .filter(([, shouldResolve]) => shouldResolve)
      .map(([id]) => id)

    try {
      if (mode === "chiamate") {
        await bulkHandleTask.mutateAsync(
          slices.map((slice) => ({
            operatorId: Number(operatorId),
            customerIds: slice,
            state: CALL_TYPE,
            // L'elenco completo vale per tutte le chiamate: ognuna ha solo i
            // clienti della sua fetta, per non passare ID estranei
            resolveAlertCustomerIds: resolveAlertCustomerIds.filter((id) =>
              slice.includes(id)
            ),
          }))
        )
      } else {
        await bulkAssignCustomers.mutateAsync(
          slices.map((slice) => ({
            operatorId: Number(operatorId),
            customerIds: slice,
          }))
        )
      }
      setSuccess(true)
    } catch {
      // The toast of the mutation says what failed: the form stays open
    } finally {
      setPending(false)
    }
  }

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
          operatorName={getOperatorName(Number(operatorId))}
          onClose={onSuccessClose}
        />
      ) : mode === null ? (
        <ModeChoice count={customerIds.length} onChoose={chooseMode} />
      ) : (
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <button
              type="button"
              onClick={goBackToChoice}
              className="-ml-5 mb-1 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:ml-0"
            >
              <ArrowLeft className="h-4 w-4" /> Cambia tipo di assegnazione
            </button>
            <DialogTitle>
              {mode === "chiamate"
                ? "Crea/assegna contatti"
                : "Assegna Clienti"}
            </DialogTitle>
            <DialogDescription>
              {mode === "chiamate"
                ? "Crea un contatto da chiamare per i clienti selezionati e li assegna all'operatore scelto."
                : `Sposta i clienti selezionati, con il loro contatto attivo in qualunque stato, all'operatore scelto, senza creare contatti. ${CLIENTI_EXPORT_NOTE}`}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex w-full flex-col items-stretch gap-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            {availableOperators && !isLoading ? (
              <div className="grid w-full gap-2">
                <Label htmlFor="bulk-operator">Operatore</Label>
                <Select onValueChange={setOperatorId} value={operatorId}>
                  <SelectTrigger id="bulk-operator">
                    <SelectValue>
                      {getOperatorName(Number(operatorId)) ||
                        "Seleziona operatore"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Operatore</SelectLabel>
                      {availableOperators
                        .filter((o) => Number(operatorId) !== o.id)
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
              </div>
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

            <Button
              className="self-end"
              disabled={disabled}
              variant={disabled ? "disabled" : "default"}
              type="submit"
            >
              {mode === "chiamate"
                ? "Crea/assegna contatti"
                : "Assegna clienti"}
            </Button>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}

type CustomerWithAlert = {
  readonly customerId: string | null
  readonly name: string | null
  readonly surname: string | null
  readonly alertId: number
  readonly deadline: Date
  readonly message: string | null
}

const AlertResolveSection = (props: {
  isLoading: boolean
  customers: readonly CustomerWithAlert[]
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
          Spunta i clienti per cui creare un nuovo contatto e risolvere
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
                  className={
                    checked ? "text-destructive-text" : "text-muted-foreground"
                  }
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
    // The export note makes the cards tall: on a short, narrow screen the
    // dialog scrolls instead of running off the top and the bottom
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
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
            <span className="text-base font-semibold">
              Crea/assegna contatti
            </span>
            <span className="text-sm text-muted-foreground">
              Crea un contatto da chiamare per ogni cliente e lo assegna
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
              {`Sposta il cliente e il suo contatto attivo, in qualunque stato, all'operatore. Non crea contatti. ${CLIENTI_EXPORT_NOTE}`}
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
    "Creazione dei contatti",
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
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>
          {props.mode === "chiamate"
            ? "Crea/assegna contatti in corso"
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
    <DialogContent className="max-w-md">
      <DialogHeader className="items-center text-center sm:pl-5 sm:text-center">
        <div className="bg-success-soft mb-2 flex h-14 w-14 items-center justify-center rounded-full">
          <CircleCheck className="h-8 w-8 text-success" />
        </div>
        <DialogTitle className="text-xl">
          {isChiamate ? "Contatti assegnati" : "Clienti assegnati"}
        </DialogTitle>
        <DialogDescription>
          {isChiamate
            ? `${props.count} contatto/i creati${props.operatorName ? ` e assegnati a ${props.operatorName}` : ""}.`
            : `${props.count} cliente/i assegnati${props.operatorName ? ` a ${props.operatorName}` : ""}, con il loro contatto attivo.`}
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
