import { AlertTriangle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { thousands } from "../_lib/format"

const lateText = (days: number) =>
  days === 1 ? "da ieri" : `da ${thousands(days)} giorni`

/** «Richiamo» of a row: how late in red, «Oggi» in amber (AC15) */
export function DueMarker({ daysLate }: { daysLate: number }) {
  const overdue = daysLate > 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-medium",
        overdue ? "text-destructive-text" : "text-tag-amber-text"
      )}
    >
      {overdue ? (
        <AlertTriangle className="h-4 w-4" aria-hidden />
      ) : (
        <Clock className="h-4 w-4" aria-hidden />
      )}
      <span>{overdue ? lateText(daysLate) : "Oggi"}</span>
    </span>
  )
}
