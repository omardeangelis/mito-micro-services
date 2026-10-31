import { useRef, useState, type RefObject } from "react"
import { describeApiError, isApiFailure } from "@/api/errors"
import {
  useDeactivateOperator,
  useDeactivationImpact,
  useOperatorsForDeactivation,
} from "@/api/operator"
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
import { toast } from "sonner"

type DeactivateOperatorDialogProps = {
  operator: { id: number; name: string; surname: string }
  onDeactivated: (operatorId: number) => void
  returnFocusTo: RefObject<HTMLElement | null>
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** An operator's name, without the parts it has none of */
const nameOf = (operator: { name: string | null; surname: string | null }) =>
  [operator.name, operator.surname].filter(Boolean).join(" ")

/**
 * The deactivation of an operator, as `DeactivateOperatorDialog` of the
 * Next.js app (AC21–AC23): what moves, and to whom. The impact and the
 * destinations are read while the dialog is open; a refused deactivation
 * says why in the dialog, which stays open
 */
export const DeactivateOperatorDialog = ({
  operator,
  onDeactivated,
  returnFocusTo,
}: DeactivateOperatorDialogProps) => {
  const fullName = `${operator.name} ${operator.surname}`
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState("")
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLButtonElement>(null)
  const deactivatedRef = useRef(false)

  const impact = useDeactivationImpact(operator.id, open)
  const targets = useOperatorsForDeactivation(operator.id, open)
  const deactivate = useDeactivateOperator()
  const submitting = deactivate.isPending

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
    if (!destinationOperator) {
      // The list was read again and no longer has the chosen operator
      setDestination("")
      setError("L'operatore scelto non è più disponibile: scegline un altro")
      return
    }
    setError(null)
    let result: Awaited<ReturnType<typeof deactivate.mutateAsync>>
    try {
      result = await deactivate.mutateAsync({
        operatorId: operator.id,
        toOperatorId: destinationOperator.id,
      })
    } catch (failure) {
      setError(
        isApiFailure(failure)
          ? describeApiError(failure)
          : "Modifica non salvata, riprova"
      )
      return
    }
    onDeactivated(operator.id)
    deactivatedRef.current = true
    setOpen(false)
    setDestination("")
    const { customersMoved, contactsMoved, practicesMoved } = result
    toast.success(
      `Operatore disattivato: ${plural(customersMoved, "cliente", "clienti")}, ${plural(contactsMoved, "contatto", "contatti")}, ${plural(practicesMoved, "pratica", "pratiche")} passati a ${nameOf(destinationOperator)}`,
      { duration: 4000 }
    )
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
        onCloseAutoFocus={(event) => {
          // The row goes after a deactivation: focus goes where the table says
          if (!deactivatedRef.current) return
          event.preventDefault()
          deactivatedRef.current = false
          returnFocusTo.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Disattiva ${fullName}`}</DialogTitle>
          <DialogDescription>
            Clienti, contatti attivi e pratiche passano a un altro operatore.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="min-h-[3.75rem]">
            {impact.isError || targets.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p role="alert" className="text-destructive-text text-sm">
                  Impossibile caricare i dati dell&apos;operatore
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    void impact.refetch()
                    void targets.refetch()
                  }}
                >
                  Riprova
                </Button>
              </div>
            ) : impact.data ? (
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
            ) : (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor={`deactivate-to-${operator.id}`} className="text-sm">
              Passa a
            </label>
            <Select
              value={destination}
              onValueChange={(value) => {
                setDestination(value)
                setError(null)
              }}
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
                    {nameOf(target)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-10 sm:min-h-5">
            {error && (
              <p role="alert" className="text-destructive-text text-sm">
                {error}
              </p>
            )}
          </div>
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
            onClick={() => void handleConfirm()}
          >
            Conferma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
