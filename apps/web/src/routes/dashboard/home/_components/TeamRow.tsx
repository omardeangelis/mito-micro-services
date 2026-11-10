import { AlertTriangle } from "lucide-react"
import { Link } from "react-router"
import { DisclosureButton } from "./DisclosureButton"
import { PersonDetail } from "./PersonDetail"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { type TeamMember } from "@mito/contract/home"
import { formatNumber } from "../../import/wave/_lib/text"
import { lastCallText, overdueText, rateText, toCallNote } from "../_lib/team"
import { toneClass } from "../_lib/tone"

/** A number with a line of small text under it */
function TwoLines({
  children,
  note,
  noteClassName,
}: {
  children: React.ReactNode
  note: string | null
  noteClassName: string
}) {
  return (
    <div className="flex flex-col">
      <span>{children}</span>
      {note === null ? null : (
        <span className={cn("text-xs", noteClassName)}>{note}</span>
      )}
    </div>
  )
}

/** «Assegna» of a person: off when `href` is `null` (AC13, D15) */
function Assign({ name, href }: { name: string; href: string | null }) {
  const label = `Assegna contatti a ${name}`
  if (href === null)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-label={label}
      >
        Assegna
      </Button>
    )
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={href} aria-label={label}>
        Assegna
      </Link>
    </Button>
  )
}

/**
 * A person of «Dettaglio giornaliero», the eight columns of AC28. The last one
 * stays on the right edge and covers the others as they scroll, so its
 * background follows the state of the row (AC46, D18)
 */
export function TeamRow({
  member,
  now,
  today,
  assignHref,
  open,
  onToggle,
}: {
  member: TeamMember
  now: Date
  today: string
  assignHref: string | null
  open: boolean
  onToggle: () => void
}) {
  const { name, calls, appointments, overdue, toCall } = member
  const lastCall = lastCallText(member, now, today)
  const note = toCallNote(member)
  const detailId = `person-${member.operatorId}`
  const numberCell = cn(
    "py-2 text-right",
    calls === 0 && "text-muted-foreground"
  )
  return (
    <>
      <TableRow className="group transition-none">
        <TableCell className="py-2 pl-5">
          <DisclosureButton
            open={open}
            controls={detailId}
            onClick={onToggle}
            className="-my-1 gap-1.5 py-1"
          >
            <span title={name} className="font-label min-w-0 truncate">
              {name}
            </span>
          </DisclosureButton>
        </TableCell>
        <TableCell className={numberCell}>{formatNumber(calls)}</TableCell>
        <TableCell className={numberCell}>{rateText(member)}</TableCell>
        <TableCell className={numberCell}>
          {calls === 0 ? "—" : formatNumber(appointments)}
        </TableCell>
        <TableCell className="py-2 pl-6">
          <TwoLines note={lastCall.idle} noteClassName={toneClass.warning}>
            <span className={cn(lastCall.tone && toneClass[lastCall.tone])}>
              {lastCall.text}
            </span>
          </TwoLines>
        </TableCell>
        <TableCell className="py-2">
          {overdue.total === 0 ? (
            <span className="text-muted-foreground">
              {overdueText(overdue)}
            </span>
          ) : (
            <TwoLines
              note={overdueText(overdue)}
              noteClassName="text-muted-foreground"
            >
              <span className="text-destructive-text inline-flex items-center gap-1 font-medium">
                <AlertTriangle aria-hidden className="size-4" />
                {formatNumber(overdue.total)}
              </span>
            </TwoLines>
          )}
        </TableCell>
        <TableCell className="py-2">
          <TwoLines note={note.text} noteClassName={toneClass[note.tone]}>
            {formatNumber(toCall)}
          </TwoLines>
        </TableCell>
        <TableCell className="group-has-aria-expanded:bg-accent sticky right-0 bg-card py-2 pr-5 text-right group-hover:bg-accent">
          <Assign name={name} href={assignHref} />
        </TableCell>
      </TableRow>
      {/* `aria-controls` always names an element: only its content comes and goes */}
      <TableRow
        id={detailId}
        hidden={!open}
        className="transition-none hover:bg-transparent"
      >
        <TableCell colSpan={8} className="p-0">
          {open ? (
            <div className="sticky left-0 w-[100cqi]">
              <PersonDetail member={member} today={today} />
            </div>
          ) : null}
        </TableCell>
      </TableRow>
    </>
  )
}
