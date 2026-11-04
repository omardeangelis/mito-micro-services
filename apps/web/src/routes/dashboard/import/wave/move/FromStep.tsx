import { useId, type ReactNode } from "react"
import { type WaveView } from "@/api/import"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { chosenText, formatNumber } from "../_lib/text"
import { noteOf } from "../split/PeopleTable"
import { byName, isInactive } from "../split/_lib/preview"

type Member = WaveView["team"][number]

const todoOf = (person: Member) =>
  person.waveTodo.toCall + person.waveTodo.noAnswer

/** A group of «Da chi» */
export type FromGroup = {
  readonly id: "inactive" | "operators" | "admins"
  readonly title: string
  readonly people: readonly Member[]
}

/**
 * The list of «Da chi» (AC23): who has to-do in the Wave, the inactive on
 * top, then the operators, then the admins; in each group the highest
 * «Totale» first, ties by name. Empty groups go
 */
export function fromGroups(team: readonly Member[]): FromGroup[] {
  const listed = team
    .filter((person) => todoOf(person) > 0)
    .sort((a, b) => todoOf(b) - todoOf(a) || byName(a, b))
  const groups: FromGroup[] = [
    {
      id: "inactive",
      title: "Inattivi · conviene spostare i loro contatti",
      people: listed.filter(isInactive),
    },
    {
      id: "operators",
      title: "Operatori",
      people: listed.filter((p) => !isInactive(p) && p.role === "OPERATORE"),
    },
    {
      id: "admins",
      title: "Admin",
      people: listed.filter((p) => !isInactive(p) && p.role === "ADMIN"),
    },
  ]
  return groups.filter((group) => group.people.length > 0)
}

/** A value with its column for who reads the screen (AC32): «Da chiamare 2» */
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

/**
 * «Da chi» (AC23, AC32, AC33): the text with «<N> scelti», «Scegli gli
 * inattivi» and «Nessuno», then, right in the step and without a card of its
 * own, who has to-do in the Wave in a real table. As in «A chi»:
 * - a click anywhere on a row changes its choice; the checkbox has the name
 *   for name and the second line for description;
 * - the focus ring goes around the whole row, inside it, and the row comes
 *   into view with 4 px of margin under the header that stays;
 * - each value is read with its column.
 * Over 30rem the list scrolls by itself
 */
export function FromStep({
  groups,
  chosen,
  onToggle,
  onChooseInactive,
  onNone,
}: {
  groups: readonly FromGroup[]
  chosen: readonly number[]
  onToggle: (operatorId: number) => void
  onChooseInactive: () => void
  onNone: () => void
}) {
  const id = useId()
  const hasInactive = groups.some((group) => group.id === "inactive")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-title`} className="text-sm text-muted-foreground">
          Scegli uno o più operatori da cui prendere i contatti di questa Wave.{" "}
          <span className="font-label text-foreground">
            {chosenText(chosen.length)}
          </span>
        </p>
        <div className="flex gap-1">
          {hasInactive ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onChooseInactive}
            >
              Scegli gli inattivi
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={chosen.length === 0}
            onClick={onNone}
          >
            Nessuno
          </Button>
        </div>
      </div>
      <div className="max-h-[30rem] overflow-y-auto">
        <table
          aria-label="Da chi"
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
              {["Da chiamare", "Non risponde", "Totale"].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="w-28 border-b border-border px-2 text-right font-normal"
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
                  colSpan={4}
                  className={cn(
                    "font-label px-2 pb-0.5 pt-2 text-left text-xs",
                    group.id === "inactive"
                      ? "text-tag-amber-text"
                      : "text-muted-foreground"
                  )}
                >
                  {group.title}
                </th>
              </tr>
              {group.people.map((person) => (
                <FromRow
                  key={person.operatorId}
                  person={person}
                  chosen={chosen.includes(person.operatorId)}
                  onToggle={() => onToggle(person.operatorId)}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

function FromRow({
  person,
  chosen,
  onToggle,
}: {
  person: Member
  chosen: boolean
  onToggle: () => void
}) {
  const id = useId()
  const inactive = isInactive(person)
  return (
    <tr
      onClick={onToggle}
      onFocus={(event) =>
        // The whole row comes into view, with its scroll margin (AC32)
        event.currentTarget.scrollIntoView?.({ block: "nearest" })
      }
      className={cn(
        "cursor-pointer select-none scroll-mb-1 scroll-mt-9 hover:bg-accent",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring",
        chosen && "bg-primary-soft hover:bg-primary-soft"
      )}
    >
      <td className="rounded-l-sm px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox
            checked={chosen}
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
      <Cell column="Da chiamare" className="text-muted-foreground">
        {formatNumber(person.waveTodo.toCall)}
      </Cell>
      <Cell column="Non risponde" className="text-muted-foreground">
        {formatNumber(person.waveTodo.noAnswer)}
      </Cell>
      <Cell column="Totale" last className="font-label rounded-r-sm">
        {formatNumber(todoOf(person))}
      </Cell>
    </tr>
  )
}
