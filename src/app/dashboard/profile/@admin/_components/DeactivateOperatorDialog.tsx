"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { api } from "@/trpc/react"
import { deactivateOperatorAction } from "../_actions/deactivateOperator"
import { describeActionError } from "../_lib/describeActionError"

type DeactivateOperatorDialogProps = {
  operator: { id: number; name: string; surname: string }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export const DeactivateOperatorDialog = ({
  operator,
}: DeactivateOperatorDialogProps) => {
  const fullName = `${operator.name} ${operator.surname}`
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLButtonElement>(null)
  const { toast } = useToast()

  const impact = api.operator.getDeactivationImpact.useQuery(
    { operatorId: operator.id },
    { enabled: open }
  )
  const targets = api.operator.getOperatorsForDeactivation.useQuery(
    { operatorId: operator.id },
    { enabled: open }
  )

  const handleOpenChange = (next: boolean) => {
    // The dialog cannot be dismissed while the request is running
    if (submitting) return
    setOpen(next)
    if (!next) {
      setDestination("")
      setError(null)
    }
  }

  const handleConfirm = async () => {
    const destinationOperator = targets.data?.find(
      (target) => String(target.id) === destination
    )
    if (!destinationOperator) return
    setSubmitting(true)
    setError(null)
    const res = await deactivateOperatorAction({
      operatorId: operator.id,
      toOperatorId: destinationOperator.id,
    })
    setSubmitting(false)
    if (res.error !== undefined) {
      setError(describeActionError(res.error))
      return
    }
    setOpen(false)
    setDestination("")
    const { customersMoved, contactsMoved, practicesMoved } = res.result
    toast({
      title: `Operatore disattivato: ${plural(customersMoved, "cliente", "clienti")}, ${plural(contactsMoved, "contatto", "contatti")}, ${plural(practicesMoved, "pratica", "pratiche")} passati a ${destinationOperator.name} ${destinationOperator.surname}`,
      duration: 4000,
      variant: "success",
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Disattiva ${fullName}`}
        >
          Disattiva
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Land on the destination select, not on the first button
          event.preventDefault()
          selectRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Disattiva ${fullName}`}</DialogTitle>
          <DialogDescription>
            Clienti, contatti attivi e pratiche passano a un altro operatore.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {impact.isLoading || !impact.data ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <ul className="text-sm">
              <li>{plural(impact.data.customers, "cliente", "clienti")}</li>
              <li>
                {plural(
                  impact.data.contacts,
                  "contatto attivo",
                  "contatti attivi"
                )}
              </li>
              <li>{plural(impact.data.practices, "pratica", "pratiche")}</li>
            </ul>
          )}

          <div className="space-y-2">
            <label htmlFor={`deactivate-to-${operator.id}`} className="text-sm">
              Passa a
            </label>
            <Select
              value={destination}
              onValueChange={setDestination}
              disabled={submitting}
            >
              <SelectTrigger
                id={`deactivate-to-${operator.id}`}
                ref={selectRef}
              >
                <SelectValue placeholder="Scegli un operatore" />
              </SelectTrigger>
              <SelectContent>
                {(targets.data ?? []).map((target) => (
                  <SelectItem key={target.id} value={String(target.id)}>
                    {`${target.name} ${target.surname}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={!destination || submitting}
            onClick={handleConfirm}
          >
            Conferma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
