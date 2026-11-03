// Variant "Schede": one step per screen, the steps in a row above it. A step
// behind can be reopened from the row; what it decided is not shown until
// you go back to it.

import * as React from "react"
import { Check, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type WaveScenario } from "./fixtures"
import { type GFlow, GuidedPage } from "./guided"

export function VariantSchede(props: { scenario: WaveScenario; now: Date }) {
  return <GuidedPage {...props} Shell={SchedeShell} />
}

function SchedeShell({ flow }: { flow: GFlow }) {
  const step = flow.steps[flow.at]!
  const ref = React.useRef<HTMLDivElement>(null)
  const first = React.useRef(true)
  React.useEffect(() => {
    // The step into view on a change, not on the first render
    if (first.current) {
      first.current = false
      return
    }
    ref.current?.scrollIntoView({ block: "start" })
  }, [flow.at])
  const back =
    flow.at > 0 ? () => flow.go(flow.at - 1) : (flow.cancel ?? undefined)
  return (
    <div ref={ref} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-label text-sm text-muted-foreground">
          {flow.title}
        </span>
        {flow.steps.length > 1 ? (
          <ol
            className="flex flex-wrap items-center gap-2 text-sm"
            aria-label="Passi"
          >
            {flow.steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={i > flow.at}
                  aria-current={i === flow.at ? "step" : undefined}
                  onClick={() => flow.go(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1 focus-visible:outline-2 focus-visible:outline-ring",
                    i === flow.at
                      ? "border-primary-soft-border bg-primary-soft text-primary-soft-foreground font-label"
                      : i < flow.at
                        ? "border-border bg-card text-foreground hover:bg-accent"
                        : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                      i < flow.at
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {i < flow.at ? <Check className="size-3" /> : i + 1}
                  </span>
                  {s.title}
                </button>
                {i < flow.steps.length - 1 ? (
                  <span aria-hidden className="h-px w-6 bg-border" />
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <section
        aria-labelledby="schede-title"
        className="rounded-card border border-border bg-card shadow-card"
      >
        <h2 id="schede-title" className="font-heading px-6 pt-5 text-lg">
          {step.title}
        </h2>
        <div className="px-6 pb-6 pt-3">{step.body}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          {back ? (
            <Button type="button" variant="ghost" onClick={back}>
              <ChevronLeft aria-hidden />
              {flow.at > 0 ? "Indietro" : "Annulla"}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={step.next.disabled}
            onClick={step.next.onClick}
          >
            {step.next.label}
          </Button>
        </div>
      </section>
    </div>
  )
}
