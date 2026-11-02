// Variant "Wave in testa": the home of the first round with the Wave above
// "Dettaglio giornaliero", and the calls export at the bottom. A Wave's row opens on who has its contacts, the ones never called
// first; "Assegna" on the row splits them with the balanced form.

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  RowsSkeleton,
  SectionBody,
  number,
  useReady,
} from "../home-operatore/shared"
import {
  type AdminScenario,
  type Operator,
  type Wave,
  isActive,
} from "./fixtures"
import { AssignPopover, awayText } from "./assign"
import {
  TeamSection,
  Top,
  WaveBar,
  WaveLegend,
  agoText,
  doneText,
} from "./parts"
import { type Plan, useTeam } from "./team"

export function VariantWave({
  scenario,
  now,
}: {
  scenario: AdminScenario
  now: Date
}) {
  const team = useTeam(scenario)
  return (
    <div className="flex flex-col gap-6">
      <Top scenario={scenario} operators={team.operators} now={now} />
      <WavesTable
        waves={team.waves}
        operators={team.operators}
        now={now}
        onAssign={team.assign}
      />
      <TeamSection
        operators={team.operators}
        waves={team.waves}
        now={now}
        onAssign={team.assign}
      />
      <ExportPlaceholder />
    </div>
  )
}

/** The calls export of today's home stays as it is (spec AC36): not rebuilt here */
function ExportPlaceholder() {
  return (
    <section aria-labelledby="export-title" className="flex flex-col gap-3">
      <h2 id="export-title" className="font-heading text-title">
        Chiamate per operatore
      </h2>
      <p className="rounded-card border-border-strong border border-dashed px-5 py-6 text-sm text-muted-foreground">
        Qui resta l&apos;export di oggi, invariato: periodo «Dal/Al»,
        indicatori, grafici e file Excel. Nel prototipo non è collegato.
      </p>
    </section>
  )
}

function WavesTable({
  waves,
  operators,
  now,
  onAssign,
}: {
  waves: readonly Wave[]
  operators: readonly Operator[]
  now: Date
  onAssign: (plan: Plan) => void
}) {
  const ready = useReady(["waves"])
  // The newest import open from the start
  const [open, setOpen] = React.useState<string | null>(waves[0]?.id ?? null)
  const unassigned = waves.reduce((s, w) => s + w.unassigned, 0)
  const neverCalled = waves.reduce((s, w) => s + w.neverCalled, 0)
  return (
    <section
      aria-labelledby="waves-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-4">
          <h2 id="waves-title" className="font-heading text-lg">
            Ultimi import
          </h2>
          {ready ? (
            <span className="text-sm text-muted-foreground">
              {unassigned > 0
                ? `${number(unassigned)} clienti senza operatore · `
                : "Nessun cliente senza operatore · "}
              {number(neverCalled)} contatti mai chiamati
            </span>
          ) : null}
        </div>
        <WaveLegend />
      </header>
      <SectionBody
        ids={["waves"]}
        what="le Wave"
        skeleton={
          <div className="px-5 py-3">
            <RowsSkeleton rows={4} />
          </div>
        }
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[62rem] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-[22rem]" />
              <col className="w-28" />
            </colgroup>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="font-label px-5 py-2">Wave</th>
                <th className="font-label px-2 py-2 text-right">Clienti</th>
                <th className="font-label px-2 py-2 text-right">
                  Senza operatore
                </th>
                <th className="font-label px-2 py-2 text-right">
                  Mai chiamati
                </th>
                <th className="font-label py-2 pl-8 pr-2">Avanzamento</th>
                <th className="px-5 py-2">
                  <span className="sr-only">Assegna</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {waves.map((w) => {
                const isOpen = open === w.id
                const detailId = `wave-${w.id}-detail`
                return (
                  <React.Fragment key={w.id}>
                    <tr
                      className={cn(
                        "border-b border-border align-middle",
                        isOpen && "bg-accent/40"
                      )}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          onClick={() => setOpen(isOpen ? null : w.id)}
                          className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground",
                              isOpen && "rotate-90"
                            )}
                          />
                          <span className="flex flex-col">
                            <span className="font-label">{w.name}</span>
                            <span className="text-xs text-muted-foreground">
                              importata {agoText(w.importedOn, now)}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {number(w.customers)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {w.unassigned > 0 ? (
                          <span className="font-label text-tag-amber-text">
                            {number(w.unassigned)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Nessuno</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {number(w.neverCalled)}
                      </td>
                      <td className="py-2.5 pl-8 pr-2">
                        <div className="flex items-center gap-3">
                          <WaveBar wave={w} className="flex-1" />
                          <span className="w-32 shrink-0 tabular-nums text-muted-foreground">
                            {doneText(w)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <AssignPopover
                          waves={waves}
                          operators={operators}
                          wave={w}
                          label={`Assegna dalla ${w.name}`}
                          onAssign={onAssign}
                        />
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr
                        id={detailId}
                        className="border-b border-border bg-accent/40"
                      >
                        <td colSpan={6} className="px-5 pb-4 pt-1">
                          <WaveHolders wave={w} operators={operators} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionBody>
    </section>
  )
}

/** Who has the Wave's contacts: who stopped calling first, then the most never called */
function WaveHolders({
  wave: w,
  operators,
}: {
  wave: Wave
  operators: readonly Operator[]
}) {
  const rows = operators
    .filter((o) => (o.byWave[w.id]?.toCall ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(isActive(a)) - Number(isActive(b)) ||
        (b.byWave[w.id]?.neverCalled ?? 0) - (a.byWave[w.id]?.neverCalled ?? 0)
    )
  const stuck = rows
    .filter((o) => !isActive(o))
    .reduce((s, o) => s + (o.byWave[w.id]?.neverCalled ?? 0), 0)
  const most = Math.max(1, ...rows.map((o) => o.byWave[w.id]?.toCall ?? 0))
  return (
    <div className="rounded-control border border-border bg-card">
      <h3 className="font-label border-b border-border px-3 py-2 text-sm">
        Chi ha i contatti della {w.name}
        <span className="font-sans font-normal text-muted-foreground">
          {" "}
          · {rows.length} {rows.length === 1 ? "operatore" : "operatori"}
          {stuck > 0 ? ` · ${number(stuck)} mai chiamati da chi è fermo` : ""}
        </span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Nessuno ha ancora contatti di questa Wave.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 px-3 py-1 lg:grid-cols-2">
          {rows.map((o) => {
            const load = o.byWave[w.id]!
            return (
              <li
                key={o.id}
                className="grid grid-cols-[minmax(0,1fr)_5rem_7.5rem_7.5rem] items-center gap-3 border-b border-border py-1.5"
              >
                <span className="min-w-0">
                  <span className="font-label block truncate">{o.name}</span>
                  {!isActive(o) ? (
                    <span className="text-tag-amber-text block text-xs">
                      {awayText(o)}
                    </span>
                  ) : null}
                </span>
                <div aria-hidden className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40"
                    style={{ width: `${(load.toCall / most) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">
                  {number(load.toCall)}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    da chiamare
                  </span>
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    !isActive(o) && load.neverCalled > 0
                      ? "text-tag-amber-text font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {number(load.neverCalled)}
                  <span className="text-xs"> mai chiamati</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
