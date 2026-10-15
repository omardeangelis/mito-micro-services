"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDeadline } from "@/lib/utils/format"

type CloseableAlert = { id: number; deadline: Date; message: string | null }

type AlertCloseConfirmDialogProps = {
  /** The open alert the state change would close; the modal is open while it is set. */
  alert: CloseableAlert | null
  onConfirm: (alertId: number) => void
  /** Annulla, Esc, a click on the overlay and the X. */
  onCancel: () => void
  /** The selector's trigger: the modal is opened from code, so it hands the focus back by hand. */
  returnFocusRef: React.RefObject<HTMLElement>
}

/**
 * Asks for confirmation before a state change closes the contact's open alert
 * (AC36). The alert goes to the Storico, it is not deleted: the confirm button
 * is the default variant, not the destructive one.
 */
export function AlertCloseConfirmDialog({
  alert,
  onConfirm,
  onCancel,
  returnFocusRef,
}: AlertCloseConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Kept while the modal is leaving, so the text doesn't go blank mid-exit
  const lastAlert = useRef(alert)
  if (alert) lastAlert.current = alert
  const shown = alert ?? lastAlert.current
  // `onConfirm` is called once per opening: a second click does nothing
  const confirmed = useRef(false)

  useEffect(() => {
    if (alert === null) confirmed.current = false
  }, [alert])

  return (
    <Dialog
      open={alert !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Chiudere il richiamo?</DialogTitle>
          <DialogDescription>
            Cambiando lo stato, il richiamo del{" "}
            {shown ? formatDeadline(shown.deadline) : ""} verrà chiuso e
            spostato nello Storico
          </DialogDescription>
        </DialogHeader>
        {shown?.message ? (
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm">
            {shown.message}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (!alert || confirmed.current) return
              confirmed.current = true
              onConfirm(alert.id)
            }}
          >
            Cambia stato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
