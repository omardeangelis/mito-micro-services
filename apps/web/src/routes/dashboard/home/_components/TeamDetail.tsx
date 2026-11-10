import { type UseQueryResult } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { adminHomeKeys } from "@/api/home"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type LatestWave,
  type LatestWaves,
  type TeamDetail as TeamDetailData,
  type TeamMember,
} from "@mito/contract/home"
import { PartSkeleton } from "../../lavoro/_components/PartSkeleton"
import { partState } from "../_lib/part"
import {
  calledText,
  sortMembers,
  teamAssignHref,
  teamSummaryText,
  type TeamOrder,
} from "../_lib/team"
import { AdminPart } from "./AdminPart"
import { DisclosureButton } from "./DisclosureButton"
import { TeamRow } from "./TeamRow"

type Role = TeamMember["role"]

/** `set` with `value` out if it was in, in if it was out */
const toggled = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

const orders = [
  { value: "arretrati", label: "Arretrati" },
  { value: "chiamate", label: "Chiamate" },
  { value: "nome", label: "Nome" },
] as const

const groups = [
  { role: "OPERATORE", title: "Operatori", column: "Operatore" },
  { role: "ADMIN", title: "Admin", column: "Admin" },
] as const

/** A group and its table, with the same columns in the two groups (AC28) */
function TeamGroup({
  group: { role, title, column },
  members,
  order,
  open,
  onToggle,
  openPeople,
  onTogglePerson,
  now,
  today,
  importRows,
}: {
  group: (typeof groups)[number]
  members: readonly TeamMember[]
  order: TeamOrder
  open: boolean
  onToggle: () => void
  openPeople: ReadonlySet<number>
  onTogglePerson: (operatorId: number) => void
  now: Date
  today: string
  importRows: readonly LatestWave[] | null
}) {
  const panelId = `team-group-${role}`
  return (
    <div className="border-b border-border last:border-b-0">
      <h3>
        <DisclosureButton
          open={open}
          controls={panelId}
          onClick={onToggle}
          className="gap-1.5 px-5 py-2 text-sm hover:bg-accent focus-visible:-outline-offset-2"
        >
          <span className="font-label">{title}</span>
          <span className="text-muted-foreground">· {calledText(members)}</span>
        </DisclosureButton>
      </h3>
      {/* `aria-controls` always names an element: only the table comes and goes */}
      <div
        id={panelId}
        hidden={!open}
        className="@container [&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-0"
      >
        {open ? (
          <Table className="min-w-[70rem] table-fixed">
            {/* The name takes what is left: `table-fixed` ignores its length */}
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-48" />
              <col className="w-48" />
              <col className="w-36" />
              <col className="w-28" />
            </colgroup>
            <TableHeader>
              <TableRow className="transition-none">
                <TableHead className="pl-5">{column}</TableHead>
                <TableHead className="text-right">Chiamate</TableHead>
                <TableHead className="text-right">Risposta</TableHead>
                <TableHead className="text-right">Appuntamenti</TableHead>
                <TableHead className="pl-6">Ultima chiamata</TableHead>
                <TableHead>Arretrati</TableHead>
                <TableHead>Da chiamare</TableHead>
                <TableHead className="sticky right-0 pr-5">
                  <span className="sr-only">Assegna</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:has(+tr[hidden]:last-child)]:border-0">
              {sortMembers(members, order).map((member) => (
                <TeamRow
                  key={member.operatorId}
                  member={member}
                  now={now}
                  today={today}
                  open={openPeople.has(member.operatorId)}
                  onToggle={() => onTogglePerson(member.operatorId)}
                  assignHref={
                    importRows && teamAssignHref(importRows, member.operatorId)
                  }
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
    </div>
  )
}

/**
 * «Dettaglio giornaliero». The queries come from `AdminHome`. The order and the
 * groups live here, above `AdminPart`, so a failed read or «Riprova» doesn't
 * reset them (D16); «Assegna» is on only with «Ultimi import» on screen (AC13)
 */
export function TeamDetail({
  team,
  waves,
}: {
  team: UseQueryResult<TeamDetailData>
  waves: UseQueryResult<LatestWaves>
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const [order, setOrder] = useState<TeamOrder>("arretrati")
  const [closed, setClosed] = useState<ReadonlySet<Role>>(new Set(["ADMIN"]))
  const [openPeople, setOpenPeople] = useState<ReadonlySet<number>>(new Set())
  const importRows =
    partState(waves) === "data" ? (waves.data?.rows ?? []) : null

  const toggle = (role: Role) => setClosed((current) => toggled(current, role))

  const togglePerson = (operatorId: number) =>
    setOpenPeople((current) => toggled(current, operatorId))

  return (
    <section
      aria-labelledby="dettaglio-giornaliero-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-4">
          <h2
            id="dettaglio-giornaliero-title"
            ref={title}
            tabIndex={-1}
            className="font-heading text-lg outline-none"
          >
            Dettaglio giornaliero
          </h2>
          {partState(team) === "data" && team.data ? (
            <span className="text-sm text-muted-foreground">
              {teamSummaryText(team.data.members)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span id="team-order">Ordina per</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={order}
            onValueChange={(value) => {
              // A click on the chosen item empties the value: the order stays
              const chosen = orders.find((item) => item.value === value)
              if (chosen) setOrder(chosen.value)
            }}
            aria-labelledby="team-order"
          >
            {orders.map(({ value, label }) => (
              <ToggleGroupItem key={value} value={value}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </header>
      <AdminPart
        query={team}
        retryKey={adminHomeKeys.team()}
        what="i numeri del team"
        focus={title}
        loading={
          <PartSkeleton rows={10} label="Caricamento dei numeri del team" />
        }
        inset
      >
        {({ members, now, today }) =>
          groups.map((group) => {
            const ofGroup = members.filter((m) => m.role === group.role)
            if (ofGroup.length === 0) return null
            return (
              <TeamGroup
                key={group.role}
                group={group}
                members={ofGroup}
                order={order}
                open={!closed.has(group.role)}
                onToggle={() => toggle(group.role)}
                openPeople={openPeople}
                onTogglePerson={togglePerson}
                now={now}
                today={today}
                importRows={importRows}
              />
            )
          })
        }
      </AdminPart>
    </section>
  )
}
