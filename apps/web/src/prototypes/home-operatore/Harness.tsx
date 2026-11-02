// The prototype of the operator's home (/dashboard/prototypes/home-operatore,
// dev only): "Lavora da qui", the variant chosen, with a scenario bar for the
// states of brain/chore/crm/design-home-e-richiami.md §7. Nothing outside
// src/prototypes imports it; delete the folder when the home lands.

import * as React from "react"
import { useSearchParams } from "react-router"
import { cn } from "@/lib/utils"
import { scenarios } from "./fixtures"
import { SectionsProvider } from "./shared"
import { VariantLavora } from "./VariantLavora"

export function Component() {
  const [params, setParams] = useSearchParams()
  const now = React.useMemo(() => new Date(), [])
  const all = React.useMemo(() => scenarios(now), [now])
  const scenario = all.find((s) => s.id === params.get("s")) ?? all[0]!

  const setScenario = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set("s", id)
        return next
      },
      { replace: true }
    )

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-4 pb-12">
        <div className="rounded-control border-border-strong flex flex-wrap items-center gap-x-4 gap-y-2 border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <span className="font-label text-foreground">
            Prototipo · dati finti
          </span>
          <span>
            Alert scaduti aperti (D1), il diario delle chiamate di oggi (D2) ed
            endpoint nuovi non esistono ancora.
          </span>
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
                onClick={() => setScenario(s.id)}
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

        {/* Keyed: a switch of scenario starts from fresh data */}
        <SectionsProvider
          key={scenario.id}
          loading={scenario.loading}
          failing={scenario.failing}
        >
          <VariantLavora scenario={scenario} now={now} />
        </SectionsProvider>
      </div>
    </div>
  )
}
