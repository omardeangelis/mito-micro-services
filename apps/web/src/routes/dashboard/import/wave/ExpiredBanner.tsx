import { AlertTriangle } from "lucide-react"
import { type WaveView } from "@/api/import"
import { Button } from "@/components/ui/button"
import { Extend } from "./Extend"
import { contactsText, formatNumber, operatorsText } from "./_lib/text"
import { memberTodo } from "./WhoHasWork"
import { waveTodo } from "./WaveHeader"

/**
 * The notice of an expired Wave with to-do (AC21), above the overview: red,
 * announced when the page opens (`role="alert"`), with «Proroga» and
 * «Riassegna». Nothing for a Wave that isn't expired or has nothing to do
 */
export function ExpiredBanner({
  id,
  wave,
  onReassign,
}: {
  id: number
  wave: WaveView
  /** «Riassegna»: opens the reassignment with the inactive chosen */
  onReassign: () => void
}) {
  const todo = waveTodo(wave)
  if (wave.status !== "expired" || todo === 0) return null
  const holders = wave.team.filter((member) => memberTodo(member) > 0).length
  const days = wave.daysSinceDeadline ?? 1
  return (
    <div
      role="alert"
      className="rounded-control border-destructive-soft-border bg-destructive-soft text-destructive-soft-foreground flex flex-wrap items-center gap-x-4 gap-y-2 border px-4 py-3 text-sm"
    >
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {days <= 1 ? "Scaduta ieri" : `Scaduta da ${formatNumber(days)} giorni`}{" "}
        con {contactsText(todo)} ancora da fare presso {operatorsText(holders)}.
        Nessuno è diventato arretrato. Spostare il da fare non cambia la
        scadenza: per toglierla dalle scadute, proroga.
      </p>
      <div className="flex gap-2">
        <Extend id={id} wave={wave} variant="default" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onReassign}
        >
          Riassegna
        </Button>
      </div>
    </div>
  )
}
