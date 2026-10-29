import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { type Operator } from "@mito/contract/schemas"
import { formatDeadline } from "@mito/client/format"
import { useHandover } from "@/api/customer"

/** What the modal says about the customer's active contact. */
export type HandoverActiveContact = {
  state: string | null
  /** The contact's operator; null when the contact has none. */
  operatorId: number | null
  /** The contact's open alert; null when there is none. */
  alert: { deadline: Date } | null
}

type CustomerHandoverDialogProps = {
  open: boolean
  /**
   * Called when the modal asks to close. `settled` is true when the server
   * answered (success or rejection), false for Annulla, Esc, the overlay and
   * the X.
   */
  onClose: (result: { settled: boolean }) => void
  /** Refreshes the page after the server answered; the form follows when it ends. */
  refresh: () => void
  /** The modal is opened from code, so it hands the focus back by hand. */
  restoreFocus: () => void
  customer: {
    id: string
    name: string | null
    surname: string | null
    operatorId: number | null
  }
  /** Every operator the form knows; the modal drops the current and the system one. */
  operators: readonly Operator[]
  activeContact: HandoverActiveContact | null
}

/**
 * "Passaggio di consegne" (D13): moves the customer and its active contact to
 * another operator. The calls already recorded on the contact follow the new
 * operator in the export, and the modal says so.
 */
export function CustomerHandoverDialog({
  open,
  onClose,
  restoreFocus,
  refresh,
  customer,
  operators,
  activeContact,
}: CustomerHandoverDialogProps) {
  const handover = useHandover()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [selectedId, setSelectedId] = useState("")
  // The call starts once per opening: a second click does nothing
  const submitted = useRef(false)

  // A fresh opening starts with no operator chosen
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelectedId("")
  }

  useEffect(() => {
    if (!open) submitted.current = false
  }, [open])

  const candidates = operators.filter(
    (operator) =>
      operator.id !== customer.operatorId &&
      operator.userId !== SYSTEM_OPERATOR_USER_ID
  )
  const selected = candidates.find((o) => o.id.toString() === selectedId)
  const pending = handover.isPending

  const customerName =
    [customer.name, customer.surname]
      .map((part) => part?.trim() ?? "")
      .filter((part) => part !== "")
      .join(" ") || "Il cliente"
  // "a Mario Rossi", or a neutral wording until one is chosen
  const to = selected
    ? `a ${operatorDisplayName(selected)}`
    : "al nuovo operatore"
  const contactOperator = activeContact?.operatorId
    ? operators.find((o) => o.id === activeContact.operatorId)
    : undefined
  const contactOperatorName = contactOperator
    ? operatorDisplayName(contactOperator)
    : "nessuno"

  const requestClose = () => {
    // Once the call started the answer closes the modal
    if (pending || submitted.current) return
    onClose({ settled: false })
  }

  const confirm = () => {
    if (!selected || submitted.current) return
    submitted.current = true
    // `mutateAsync` settles after an unmount, the per-call callbacks of
    // `mutate` don't: the toast and the refresh must still run
    handover
      .mutateAsync({ customerId: customer.id, toOperatorId: selected.id })
      .then(
        () => {
          onClose({ settled: true })
          refresh()
        },
        () => {
          onClose({ settled: true })
          // The toast of the mutation gives the reason, the refresh shows
          // the current operator
          refresh()
        }
      )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Passaggio di consegne</DialogTitle>
          <DialogDescription asChild className="text-foreground">
            <div className="space-y-2">
              <p>
                {customerName} passa {to}.
              </p>
              {activeContact ? (
                <p>
                  Anche il contatto attivo ({activeContact.state ?? "nessuno"},{" "}
                  {activeContact.alert
                    ? `prossimo alert ${formatDeadline(activeContact.alert.deadline) ?? ""}, `
                    : ""}
                  oggi assegnato a {contactOperatorName}) passa {to}. Le
                  chiamate già registrate su questo contatto saranno attribuite{" "}
                  {to} nell&apos;export.
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="handover-operator">Nuovo operatore</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger id="handover-operator" ref={triggerRef}>
              <SelectValue placeholder="Seleziona un operatore" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Operatore</SelectLabel>
                {candidates.map((operator) => (
                  <SelectItem key={operator.id} value={operator.id.toString()}>
                    {operatorDisplayName(operator)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            aria-disabled={pending}
            onClick={requestClose}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!selected}
            aria-busy={pending}
            aria-disabled={pending ? true : undefined}
            onClick={confirm}
          >
            {pending ? (
              <LoadingSpinner className="mr-2 h-4 w-4 motion-reduce:animate-none" />
            ) : null}
            Passa le consegne
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
