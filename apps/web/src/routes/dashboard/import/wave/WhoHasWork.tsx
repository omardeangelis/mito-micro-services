import { type WaveView } from "@/api/import"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "./_lib/text"
import { byName } from "./split/_lib/preview"

type Member = WaveView["team"][number]

/** Da fare of a person in the Wave */
export const memberTodo = (member: Member) =>
  member.waveTodo.toCall + member.waveTodo.noAnswer

/** Inactive: 7 working days or more without calling (`inactiveDays` is set) */
export const isInactive = (member: Member) => member.inactiveDays !== null

/**
 * The people of «Chi ha il da fare» (AC19): who has to-do in the Wave and
 * every operator, inactive first, then by most to-do, then by name
 */
export function whoHasWork(team: WaveView["team"]): Member[] {
  return team
    .filter((member) => memberTodo(member) > 0 || member.role === "OPERATORE")
    .sort(
      (a, b) =>
        Number(isInactive(b)) - Number(isInactive(a)) ||
        memberTodo(b) - memberTodo(a) ||
        byName(a, b)
    )
}

/**
 * «Chi ha il da fare» (AC19): «Riassegna…» beside the title and a row for
 * each person: name, what they have, a bar in proportion to the most, the
 * number and «Sposta» when there is something to move
 */
export function WhoHasWork({
  team,
  onReassign,
  onMove,
}: {
  team: WaveView["team"]
  /** «Riassegna…»: opens the reassignment with the inactive chosen */
  onReassign: () => void
  /** «Sposta»: opens it with that person chosen */
  onMove: (operatorId: number) => void
}) {
  const rows = whoHasWork(team)
  const most = Math.max(1, ...rows.map(memberTodo))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg">Chi ha il da fare</h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onReassign}
        >
          Riassegna…
        </Button>
      </div>
      <ul aria-label="Chi ha il da fare" className="flex flex-col">
        {rows.map((member) => {
          const todo = memberTodo(member)
          const inactive = isInactive(member)
          return (
            <li
              key={member.operatorId}
              className="grid grid-cols-[minmax(0,1fr)_8rem_8rem_6rem] items-center gap-4 border-b border-border py-2 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="min-w-0">
                <span data-name className="font-label block truncate">
                  {member.name}
                </span>
                <span
                  className={cn(
                    "block text-xs",
                    inactive ? "text-tag-amber-text" : "text-muted-foreground"
                  )}
                >
                  {inactive
                    ? `inattivo da ${formatNumber(member.inactiveDays ?? 0)} giorni · `
                    : ""}
                  {formatNumber(member.waveTodo.toCall)} da chiamare ·{" "}
                  {formatNumber(member.waveTodo.noAnswer)} non risponde
                </span>
              </span>
              <div
                aria-hidden
                className="h-1.5 rounded-full bg-muted max-sm:hidden"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    inactive ? "bg-tag-amber-dot" : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${(todo / most) * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums max-sm:col-start-2">
                {todo === 0 ? (
                  <span className="text-muted-foreground">Niente da fare</span>
                ) : (
                  `${formatNumber(todo)} da fare`
                )}
              </span>
              <span className="text-right max-sm:col-span-2">
                {todo > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Sposta il da fare di ${member.name}`}
                    onClick={() => onMove(member.operatorId)}
                  >
                    Sposta
                  </Button>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
