import { Badge } from "@/components/ui/badge"
import { type ContactEditability } from "@/lib/domain/contact/permissions"

type ReadOnlyEditability = Exclude<ContactEditability, { kind: "editable" }>

type ReadOnlyReasonProps = {
  editability: ReadOnlyEditability
  /** The customer has no operator, so "Assegna a te" is within reach (A1). */
  customerUnassigned?: boolean
  /** Add the hint under "Non assegnato"; the table shows it once, not on every row. */
  showHint?: boolean
}

const reasonOf = (editability: ReadOnlyEditability): string => {
  if (editability.kind === "superseded") return "Superato"
  return editability.assignee === null
    ? "Non assegnato"
    : `Assegnato a ${editability.assignee}`
}

/**
 * Why a contact can't be edited here (AC51): plain text in a badge, not a
 * disabled control. Fixed width, so the table column doesn't jump between the
 * selector and the reason.
 */
export function ReadOnlyReason({
  editability,
  customerUnassigned = false,
  showHint = false,
}: ReadOnlyReasonProps) {
  const unassigned =
    editability.kind === "not_owner" && editability.assignee === null
  return (
    <div className="w-40">
      <Badge
        variant="outline"
        size="sm"
        className="max-w-full font-normal text-muted-foreground"
        title={reasonOf(editability)}
      >
        <span className="truncate">{reasonOf(editability)}</span>
      </Badge>
      {unassigned && customerUnassigned && showHint ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Usa “Assegna a te” nella scheda cliente
        </p>
      ) : null}
    </div>
  )
}
