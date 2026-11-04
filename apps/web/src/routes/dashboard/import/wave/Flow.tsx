import { Check, ChevronLeft } from "lucide-react"
import { type ReactNode, useId } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A step of a flow: its title, what it asks and the button that ends it */
export type FlowStep = {
  readonly id: string
  /** «Ingressi e scadenza», «Assegna», «Da chi»… */
  readonly title: string
  readonly body: ReactNode
  /** The button on the right of the footer: «Avanti», «Assegna <N> a <K> operatori»… */
  readonly action: {
    readonly label: string
    readonly onClick: () => void
    readonly disabled?: boolean
  }
  /** Above the footer: the outcome of a confirmation that didn't succeed (AC16) */
  readonly message?: ReactNode
}

/**
 * The shape of every flow of the page (AC4, AC9, AC22): the title of the
 * flow, the steps in a row, and the card of the step open, one per screen.
 * - A step done has the check and opens again with a click; a step after the
 *   one open doesn't open.
 * - The footer has «Annulla» on the first step, «Indietro» on the others, and
 *   on the right the button of the step. From the second step the title has
 *   «Annulla» too.
 * - The switch is instant: nothing animates (AC35).
 *
 * The step open is the page's (`at`, `onGo`), so the focus can follow it
 * (AC31): its title carries `data-screen-title`. While a confirmation runs
 * (`locked`) the row, «Indietro» and «Annulla» don't answer (AC15)
 */
export function Flow({
  title,
  steps,
  at,
  onGo,
  onCancel,
  locked = false,
  showSteps = steps.length > 1,
}: {
  /** «Dopo l'import», «Assegna i restanti», «Riassegna» */
  title: string
  steps: readonly FlowStep[]
  at: number
  onGo: (step: number) => void
  /** Back to the overview */
  onCancel: () => void
  locked?: boolean
  /** The row of the steps; by default only with more than one */
  showSteps?: boolean
}) {
  const id = useId()
  const step = steps[Math.min(at, steps.length - 1)]
  if (step === undefined) return null
  const first = at === 0
  return (
    <section aria-labelledby={`${id}-flow`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2
          id={`${id}-flow`}
          className="font-label text-sm text-muted-foreground"
        >
          {title}
        </h2>
        {showSteps ? (
          <ol
            aria-label="Passi"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            {steps.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={locked || index >= at}
                  aria-current={index === at ? "step" : undefined}
                  onClick={() => onGo(index)}
                  className={cn(
                    "flex min-h-6 items-center gap-2 rounded-full border px-3 py-1",
                    index === at
                      ? "border-primary-soft-border bg-primary-soft font-label text-primary-soft-foreground"
                      : index < at
                        ? "border-border bg-card text-foreground hover:bg-accent"
                        : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                      index < at
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {index < at ? <Check className="size-3" /> : index + 1}
                  </span>
                  {item.title}
                  {index < at ? <span className="sr-only">, fatto</span> : null}
                </button>
                {index < steps.length - 1 ? (
                  <span aria-hidden className="h-px w-6 bg-border" />
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        {first ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={locked}
            onClick={onCancel}
          >
            Annulla
          </Button>
        )}
      </div>
      <section
        aria-labelledby={`${id}-step`}
        className="rounded-card border border-border bg-card shadow-card"
      >
        <h3
          id={`${id}-step`}
          tabIndex={-1}
          data-screen-title
          className="font-heading px-6 pt-5 text-lg outline-none"
        >
          {step.title}
        </h3>
        <div className="px-6 pb-6 pt-3">{step.body}</div>
        {step.message ? <div className="px-6 pb-4">{step.message}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={locked}
            onClick={first ? onCancel : () => onGo(at - 1)}
          >
            <ChevronLeft aria-hidden />
            {first ? "Annulla" : "Indietro"}
          </Button>
          <Button
            type="button"
            disabled={step.action.disabled}
            onClick={step.action.onClick}
          >
            {step.action.label}
          </Button>
        </div>
      </section>
    </section>
  )
}
