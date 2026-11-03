// The prototype of the Wave's page (/dashboard/prototypes/import-wave, dev
// only): from the end of an import, or a row of the history, to assigning
// the Wave and moving one operator's «da fare»
// (brain/chore/crm/design-import-e-assegnazione-wave.md §5). The variant
// kept is "Schede", with a scenario bar for the states. Nothing outside
// src/prototypes imports it; delete the folder when the page lands.

import * as React from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { number } from "../home-operatore/shared"
import { waveScenarios } from "./fixtures"
import { VariantSchede } from "./VariantSchede"

export function Component() {
  const [params, setParams] = useSearchParams()
  const now = React.useMemo(() => new Date(), [])
  const all = React.useMemo(() => waveScenarios(now), [now])
  const scenario = all.find((s) => s.id === params.get("s")) ?? all[0]!
  // A new mount on every entry from the toast
  const [nonce, setNonce] = React.useState(0)

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set(key, value)
        return next
      },
      { replace: true }
    )

  const endOfImport = () => {
    const w = scenario.wave
    toast.success(`Import completato: ${w.fileName}`, {
      description: `${number(w.customers)} clienti · ${number(w.unassigned)} senza operatore`,
      action: {
        label: "Assegna",
        onClick: () => setNonce((n) => n + 1),
      },
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-4 pb-12">
        <div className="rounded-control border-border-strong flex flex-wrap items-center gap-x-4 gap-y-2 border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <span className="font-label text-foreground">
            Prototipo · dati finti
          </span>
          <span>
            Scadenza, tipo dall&apos;«Iniziativa», traccia dei clienti per
            import e spostamenti non esistono ancora. Si arriva qui dal toast di
            fine import o da una riga dello storico.
          </span>
          <button
            type="button"
            onClick={endOfImport}
            className="font-label rounded-full border border-border bg-card px-2.5 py-1 hover:bg-accent"
          >
            Simula la fine dell&apos;import
          </button>
          <div
            className="ml-auto flex flex-wrap gap-1"
            role="group"
            aria-label="Scenario"
          >
            {all.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === scenario.id}
                onClick={() => set("s", s.id)}
                className={cn(
                  "font-label rounded-full border px-2.5 py-1",
                  s.id === scenario.id
                    ? "border-primary-soft-border bg-primary-soft text-primary-soft-foreground"
                    : "border-border bg-card hover:bg-accent"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <VariantSchede
          key={`${scenario.id}-${nonce}`}
          scenario={scenario}
          now={now}
        />
      </div>
    </div>
  )
}
