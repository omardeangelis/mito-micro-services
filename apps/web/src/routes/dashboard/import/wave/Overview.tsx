import { type WaveView } from "@/api/import"
import { Button } from "@/components/ui/button"
import { type PageMode } from "./_lib/mode"
import { customersText } from "./_lib/text"
import { ExpiredBanner } from "./ExpiredBanner"
import { PartsBar } from "./PartsBar"
import { isInactive, memberTodo, WhoHasWork } from "./WhoHasWork"

/**
 * The overview of the Wave (AC19, AC21): the notice of an expired Wave, the
 * parts of the Wave, the box of the customers still without an operator and
 * «Chi ha il da fare». The buttons only set the mode of the page: «Assegna»
 * opens «Assegna i restanti», or the flow at its first step on a Wave still
 * to confirm; «Riassegna…», «Riassegna» and «Sposta» the reassignment
 */
export function Overview({
  id,
  wave,
  setMode,
}: {
  id: number
  wave: WaveView
  setMode: (mode: PageMode) => void
}) {
  const inactiveWithTodo = wave.team
    .filter((member) => isInactive(member) && memberTodo(member) > 0)
    .map((member) => member.operatorId)
  const reassign = (from: readonly number[]) =>
    setMode({ kind: "reassign", at: 0, from })
  const assign = () =>
    setMode(
      wave.deadline === null
        ? { kind: "afterImport", at: 0 }
        : { kind: "assignRest" }
    )
  return (
    <>
      <ExpiredBanner
        id={id}
        wave={wave}
        onReassign={() => reassign(inactiveWithTodo)}
      />
      <section
        aria-label="Panoramica della Wave"
        className="rounded-card flex flex-col gap-5 border border-border bg-card p-6 shadow-card"
      >
        <PartsBar parts={wave.parts} />
        {wave.toAssign > 0 ? (
          <div className="rounded-control border-tag-amber-border bg-tag-amber-bg flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm">
            <span>{customersText(wave.toAssign)} ancora senza operatore</span>
            <Button type="button" size="sm" onClick={assign}>
              Assegna
            </Button>
          </div>
        ) : null}
        <WhoHasWork
          team={wave.team}
          onReassign={() => reassign(inactiveWithTodo)}
          onMove={(operatorId) => reassign([operatorId])}
        />
      </section>
    </>
  )
}
