import { Badge } from "@/components/ui/badge"
import { type ContactEditability } from "@/lib/domain/contact/permissions"

type ReadOnlyEditability = Exclude<ContactEditability, { kind: "editable" }>

type ReadOnlyReasonProps = {
  editability: ReadOnlyEditability
  /** The customer has no operator, so "Assegna a te" is within reach (A1). */
  customerUnassigned?: boolean
  /** Add the hint under "Non assegnato" when the customer is unassigned too (A1). */
  showHint?: boolean
  /** Take the room the text needs, untruncated; the table keeps a fixed width. */
  fit?: boolean
}

const reasonOf = (editability: ReadOnlyEditability): string => {
  if (editability.kind === "superseded") return "Superato"
  return editability.assignee === null
    ? "Non assegnato"
    : `Assegnato a ${editability.assignee}`
}

/**
 * Neither the contact nor its customer has an operator. Where the customer's
 * operator is on screen (the Clienti row, the customer card) it is also the
 * contact's (AC75), so only this case gets the reason, for the "Assegna a te"
 * hint (A1, D14).
 */
export const isUnclaimed = (
  editability: ReadOnlyEditability,
  customerOperatorId: number | null
): boolean =>
  editability.kind === "not_owner" &&
  editability.assignee === null &&
  customerOperatorId === null

/**
 * Why a contact can't be edited here (AC51): plain text in a badge, not a
 * disabled control. Fixed width in the table, so the column doesn't jump
 * between the selector and the reason; `fit` drops it where there is room.
 */
export function ReadOnlyReason({
  editability,
  customerUnassigned = false,
  showHint = false,
  fit = false,
}: ReadOnlyReasonProps) {
  const unassigned =
    editability.kind === "not_owner" && editability.assignee === null
  return (
    <div className={fit ? undefined : "w-40"}>
      <Badge
        variant="outline"
        size="sm"
        // neutral-600: muted-foreground is 4.31:1 on a hovered table row
        className="max-w-full font-normal text-neutral-600"
        title={reasonOf(editability)}
      >
        <span className={fit ? undefined : "truncate"}>
          {reasonOf(editability)}
        </span>
      </Badge>
      {unassigned && customerUnassigned && showHint ? (
        <p className="mt-1 text-xs text-neutral-600">
          Usa “Assegna a te” nella scheda cliente
        </p>
      ) : null}
    </div>
  )
}
