import { useState } from "react"
import { addDays, proposeDeadline, type Day } from "@mito/domain/wave/days"
import { useSetDeadline, type WaveView } from "@/api/import"
import { DeadlineField } from "./DeadlineField"
import { Distribution } from "./Distribution"
import { confirmFailureText } from "./_lib/errors"
import { type FlowStep } from "./Flow"

/** The note of a Wave whose customers were rebuilt, not recorded (AC29) */
const REBUILT_NOTE =
  "Wave importata prima della traccia dei clienti: Nuovi e Già presenti non si distinguono."

/**
 * The body of «Ingressi e scadenza» (AC5, AC6): the distribution and, under
 * it, the box «Scadenza», marked «Obbligatoria», with the day the Wave starts
 * from (today + 30) and «Scegli la scadenza» from tomorrow
 */
export function ArrivalsBody({
  wave,
  deadline,
  onDeadline,
  disabled,
}: {
  wave: WaveView
  deadline: Day
  onDeadline: (day: Day) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      <Distribution wave={wave} />
      {wave.origin.traceRebuilt ? (
        <p className="text-sm text-muted-foreground">{REBUILT_NOTE}</p>
      ) : null}
      <div className="border-t border-border pt-5">
        <section
          aria-labelledby="wave-deadline-title"
          className="rounded-control border-primary-soft-border bg-primary-soft flex flex-col gap-3 border px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4
              id="wave-deadline-title"
              className="font-heading text-primary-soft-foreground text-lg"
            >
              Scadenza
            </h4>
            <span className="font-label text-primary-soft-foreground rounded-full bg-card px-2 py-0.5 text-xs">
              Obbligatoria
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Il giorno entro cui le chiamate assegnate andranno eseguite. Le
            chiamate con una scadenza avranno priorità rispetto a quelle senza.
          </p>
          <DeadlineField
            value={deadline}
            onChange={onDeadline}
            today={wave.today}
            min={addDays(wave.today, 1)}
            hideLabel
            prominent
            label="Scadenza"
            disabled={disabled}
          />
        </section>
      </div>
    </div>
  )
}

/**
 * «Ingressi e scadenza» (AC4–AC9): the step and its save. «Avanti» (or
 * «Conferma la scadenza» with 0 to assign) saves the day with `confirm`; the
 * step is `saving` meanwhile, and `onSaved` runs once it is saved. A failure
 * stays above the footer with the day chosen (AC16)
 */
export function useArrivals({
  id,
  wave,
  onSaved,
}: {
  id: number
  wave: WaveView
  onSaved: (deadline: Day) => void
}): { step: FlowStep; saving: boolean } {
  const [deadline, setDeadline] = useState<Day>(() =>
    proposeDeadline(wave.today)
  )
  const [message, setMessage] = useState<string | null>(null)
  const save = useSetDeadline(id, {
    onSuccess: (result) => {
      setMessage(null)
      onSaved(result.after)
    },
    onError: (error) => setMessage(confirmFailureText(error)),
  })
  const step: FlowStep = {
    id: "arrivals",
    title: "Ingressi e scadenza",
    body: (
      <ArrivalsBody
        wave={wave}
        deadline={deadline}
        onDeadline={setDeadline}
        disabled={save.isPending}
      />
    ),
    action: {
      label: wave.toAssign > 0 ? "Avanti" : "Conferma la scadenza",
      disabled: save.isPending,
      onClick: () => {
        setMessage(null)
        save.mutate({ deadline, kind: "confirm" })
      },
    },
    message:
      message === null ? undefined : (
        <p role="alert" className="text-destructive-text text-sm">
          {message}
        </p>
      ),
  }
  return { step, saving: save.isPending }
}
