import { TriangleAlert } from "lucide-react"
import { Fragment, useId, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { chosenText, formatNumber, plural } from "../_lib/text"
import {
  inactiveText,
  isInactive,
  perDay,
  type Group,
  type Member,
} from "./_lib/preview"

/** A value with its column for who reads the screen (AC32): «Attive 2» */
const Cell = ({
  column,
  last = false,
  className,
  children,
}: {
  column: string
  last?: boolean
  className?: string
  children: ReactNode
}) => (
  <td className={cn("px-2 py-1.5 text-right tabular-nums", className)}>
    <span className="sr-only">{column} </span>
    {children}
    {last ? null : <span className="sr-only">{", "}</span>}
  </td>
)

/** The second line under the name, always there (AC12) */
export function noteOf(person: Member) {
  if (person.inactiveDays !== null) return inactiveText(person.inactiveDays)
  if (person.exactPace === 0) return "nessuna chiamata negli ultimi 30 giorni"
  return `${plural(person.pace, "chiamata", "chiamate")} al giorno`
}

/**
 * «A chi» (AC12, AC32, AC33): «A chi · <N> scelti» with «Tutti gli attivi» and
 * «Nessuno», and the team in a real table, one group per kind. Each row:
 * - a click anywhere on it changes the choice; the checkbox has the name for
 *   name and the second line for description;
 * - the focus ring goes around the whole row, inside it, so the list that
 *   scrolls doesn't cut it; the row comes into view with 4 px of margin under
 *   the header that stays;
 * - each value is read with its column: «Attive 2, Assegnate +342, Totale
 *   344, Al giorno 16».
 * Changing the division moves no row: the second line is always there
 */
export function PeopleTable({
  groups,
  chosen,
  shares,
  workdays,
  onToggle,
  onAllActive,
  onNone,
  disabled = false,
}: {
  groups: readonly Group[]
  chosen: readonly number[]
  /** What each person gets in the preview, when it is valid */
  shares: ReadonlyMap<number, number>
  /** Working days left to the deadline, for «Al giorno» */
  workdays: number | null
  onToggle: (operatorId: number) => void
  onAllActive: () => void
  onNone: () => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-control flex flex-col gap-2 border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id={`${id}-title`} className="font-label text-sm">
          A chi
          <span className="font-sans font-normal text-muted-foreground">
            {" "}
            · {chosenText(chosen.length)}
          </span>
        </h4>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onAllActive}
          >
            Tutti gli attivi
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onNone}
          >
            Nessuno
          </Button>
        </div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        <table
          aria-labelledby={`${id}-title`}
          className="w-full border-separate border-spacing-0 text-sm"
        >
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
            <tr className="h-8">
              <th
                scope="col"
                className="border-b border-border px-2 text-left font-normal"
              >
                <span className="pl-6">Nome</span>
              </th>
              {["Attive", "Assegnate", "Totale", "Al giorno"].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="w-20 border-b border-border px-2 text-right font-normal"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={5}
                  className="font-label px-2 pb-0.5 pt-2 text-left text-xs text-muted-foreground"
                >
                  {group.title}
                </th>
              </tr>
              {group.people.map((person) => (
                <PersonRow
                  key={person.operatorId}
                  person={person}
                  chosen={chosen.includes(person.operatorId)}
                  share={shares.get(person.operatorId) ?? 0}
                  workdays={workdays}
                  disabled={disabled}
                  onToggle={() => onToggle(person.operatorId)}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="text-tag-amber-text">In ambra</span>: più del suo ritmo
      </p>
    </section>
  )
}

function PersonRow({
  person,
  chosen,
  share,
  workdays,
  disabled,
  onToggle,
}: {
  person: Member
  chosen: boolean
  share: number
  workdays: number | null
  disabled: boolean
  onToggle: () => void
}) {
  const id = useId()
  const inactive = isInactive(person)
  const todo = person.waveTodo.toCall + person.waveTodo.noAnswer + share
  const day = perDay(todo, workdays)
  const above = day !== null && !inactive && day > person.pace
  return (
    <tr
      onClick={disabled ? undefined : onToggle}
      onFocus={(event) =>
        // The whole row comes into view, with its scroll margin (AC32)
        event.currentTarget.scrollIntoView?.({ block: "nearest" })
      }
      className={cn(
        "select-none scroll-mb-1 scroll-mt-9",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring",
        disabled ? "opacity-60" : "cursor-pointer hover:bg-accent"
      )}
    >
      <td className="rounded-l-sm px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox
            checked={chosen}
            disabled={disabled}
            aria-labelledby={`${id}-name`}
            aria-describedby={`${id}-note`}
            // The row changes the choice: the click of the box is the row's
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={onToggle}
            className="focus-visible:outline-none"
          />
          <div className="flex min-w-0 flex-col">
            <span id={`${id}-name`} className="truncate">
              {person.name}
            </span>
            <span
              id={`${id}-note`}
              className={cn(
                "text-xs",
                inactive ? "text-tag-amber-text" : "text-muted-foreground"
              )}
            >
              {noteOf(person)}
            </span>
            <span className="sr-only">{", "}</span>
          </div>
        </div>
      </td>
      <Cell column="Attive" className="text-muted-foreground">
        {formatNumber(person.active)}
      </Cell>
      <Cell
        column="Assegnate"
        className={
          share > 0
            ? "text-tag-green-text font-medium"
            : "text-muted-foreground"
        }
      >
        {share > 0 ? `+${formatNumber(share)}` : "—"}
      </Cell>
      <Cell
        column="Totale"
        className={share > 0 ? undefined : "text-muted-foreground"}
      >
        {share > 0 ? formatNumber(person.active + share) : "—"}
      </Cell>
      <Cell
        column="Al giorno"
        last
        className={cn(
          "rounded-r-sm",
          above ? "text-tag-amber-text font-medium" : "text-muted-foreground"
        )}
      >
        {day === null ? (
          "—"
        ) : (
          <Fragment>
            {above ? (
              <TriangleAlert
                aria-hidden
                className="mr-1 inline size-3.5 align-[-2px]"
              />
            ) : null}
            {formatNumber(day)}
            {above ? <span className="sr-only"> sopra il ritmo</span> : null}
          </Fragment>
        )}
      </Cell>
    </tr>
  )
}
