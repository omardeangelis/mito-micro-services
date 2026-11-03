// The guided flow every variant shares: what each step asks and what it
// decides. The variants differ only in the shell that walks the steps.
// - After an import: Ingressi (who came in, the deadline) → Assegna (the clients without an operator). Clients in Richiamo
//   stay with their operator and their callback: no step of their own.
// - Moving: Da chi (one or more operators) → Quali e quanti contatti → A chi.
// A Wave with its deadline opens on its summary, where both flows start.

import * as React from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { number } from "../home-operatore/shared"
import { type Operator, isActive } from "../home-admin/fixtures"
import { Distribution } from "./distribution"
import { type WaveScenario } from "./fixtures"
import {
  type Split,
  type WaveModel,
  andText,
  awayText,
  dayText,
  firstName,
  shortDay,
  submitText,
  useSplit,
  useWave,
  waveLoad,
  whichLabels,
} from "./model"
import {
  CountField,
  DeadlineField,
  DeadlineStatus,
  ExpiredBanner,
  ExtendButton,
  HowManyField,
  Parts,
  SplitRows,
  SplitSummary,
  StrategyField,
  WaveHeader,
  WhichField,
  distributionOf,
  workdaysFor,
} from "./shared"

// ---- The flow a shell walks ----

export type GStep = {
  id: string
  title: string
  /** What the step decided, in a few words, once it is behind */
  summary: string
  body: React.ReactNode
  next: { label: string; disabled?: boolean; onClick: () => void }
}

export type GFlow = {
  /** «Assegna la Wave», «Riassegna» */
  title: string
  steps: GStep[]
  at: number
  go: (i: number) => void
  /** Back to the Wave's summary: missing when there is nowhere to go back to */
  cancel?: () => void
}

export type Shell = React.ComponentType<{ flow: GFlow }>

/** «Avanti» before the page wires it to the next step */
const moveOn = () => undefined

type Mode =
  | { kind: "assign"; at: number }
  | { kind: "move"; at: number }
  | { kind: "overview" }
  | { kind: "done"; title: string; text: string; extend?: boolean }

/** The page: the header, then the flow in the shell, the summary or the outcome */
export function GuidedPage({
  scenario,
  now,
  Shell,
}: {
  scenario: WaveScenario
  now: Date
  Shell: Shell
}) {
  const model = useWave(scenario, now)
  const firstTime = scenario.wave.deadline === null
  const [mode, setMode] = React.useState<Mode>(
    firstTime ? { kind: "assign", at: 0 } : { kind: "overview" }
  )
  const assign = useSplit({
    wave: model.wave,
    operators: model.operators,
    from: null,
  })
  const [moveFrom, setMoveFrom] = React.useState<readonly number[]>([])
  const move = useSplit({
    wave: model.wave,
    operators: model.operators,
    from: moveFrom,
  })

  const top = () => window.scrollTo({ top: 0 })
  const toOverview = () => {
    setMode({ kind: "overview" })
    top()
  }
  const startMove = (from: readonly number[]) => {
    move.reset()
    setMoveFrom(from)
    setMode({ kind: "move", at: 0 })
    top()
  }
  const startAssign = () => {
    assign.reset()
    setMode({ kind: "assign", at: 0 })
    top()
  }
  const stuck = () =>
    distributionOf(model)
      .filter((r) => r.toDo > 0 && !isActive(r.operator))
      .map((r) => r.operator.id)

  let flow: GFlow | null = null
  if (mode.kind === "assign") {
    // The first time both; later only the split of who is left
    const steps = firstTime
      ? [
          arrivalsStep(model, now),
          assignStep(model, assign, now, () => {
            setMode({
              kind: "done",
              title: `Assegnati ${number(assign.value)} clienti della ${model.wave.name}`,
              text: doneText(model),
            })
            top()
          }),
        ]
      : [
          assignStep(model, assign, now, () => {
            setMode({
              kind: "done",
              title: `Assegnati ${number(assign.value)} clienti della ${model.wave.name}`,
              text: "Gli operatori li trovano nella home da subito.",
            })
            top()
          }),
        ]
    // «Avanti» moves on, the last step's button acts
    steps.forEach((s, i) => {
      if (i < steps.length - 1) {
        const onNext = s.next.onClick
        s.next.onClick = () => {
          onNext()
          setMode({ kind: "assign", at: i + 1 })
        }
      }
    })
    flow = {
      title: firstTime ? "Dopo l'import" : "Assegna i restanti",
      steps,
      at: Math.min(mode.at, steps.length - 1),
      go: (i) => setMode({ kind: "assign", at: i }),
      ...(firstTime ? {} : { cancel: toOverview }),
    }
  } else if (mode.kind === "move") {
    const steps = moveSteps(model, move, moveFrom, setMoveFrom, now, () => {
      const names = move.sources.filter((o) => move.plan?.take.has(o.id))
      setMode({
        kind: "done",
        title: `Spostati ${number(move.value)} contatti`,
        text: `Da ${andText(names.map(firstName))} a ${
          move.plan?.give.size ?? 0
        } operatori. Stato, alert e chat restano come sono.${
          model.expired
            ? " La Wave resta scaduta: spostare non cambia la scadenza."
            : ""
        }`,
        extend: model.expired,
      })
      top()
    })
    steps.forEach((s, i) => {
      if (i < steps.length - 1) {
        s.next.onClick = () => setMode({ kind: "move", at: i + 1 })
      }
    })
    flow = {
      title: "Riassegna",
      steps,
      at: mode.at,
      go: (i) => setMode({ kind: "move", at: i }),
      cancel: toOverview,
    }
  }

  const showStatus = !(mode.kind === "assign" && firstTime)
  return (
    <div className="flex flex-col gap-5">
      <WaveHeader model={model} now={now} entry={scenario.entry}>
        {showStatus && model.wave.deadline ? (
          <div className="flex items-center gap-3">
            <DeadlineStatus model={model} now={now} />
            <ExtendButton model={model} now={now} />
          </div>
        ) : null}
      </WaveHeader>
      {flow ? (
        <Shell flow={flow} />
      ) : mode.kind === "done" ? (
        <DonePanel
          title={mode.title}
          text={mode.text}
          extend={
            mode.extend ? (
              <ExtendButton model={model} now={now} size="lg" />
            ) : null
          }
          left={model.wave.unassigned}
          onMore={startAssign}
          onOverview={toOverview}
        />
      ) : (
        <Overview
          model={model}
          now={now}
          onAssign={startAssign}
          onMove={startMove}
          onReassign={() => startMove(stuck())}
        />
      )}
    </div>
  )
}

function doneText(model: WaveModel) {
  return `Scadenza ${dayText(model.wave.deadline ?? model.draftDeadline)}. Gli operatori li trovano nella home da subito.`
}

// ---- Ingressi ----

function arrivalsStep(model: WaveModel, now: Date): GStep {
  const a = model.wave.arrivals
  const present = Object.values(a.present).reduce((s, n) => s + n, 0)
  return {
    id: "arrivals",
    title: "Ingressi e scadenza",
    summary: `${number(a.newCustomers)} nuovi, ${number(present)} già presenti · scadenza ${shortDay(model.draftDeadline)}`,
    body: <ArrivalsBody model={model} now={now} />,
    next: { label: "Avanti", onClick: moveOn },
  }
}

function ArrivalsBody({ model, now }: { model: WaveModel; now: Date }) {
  const w = model.wave
  return (
    <div className="flex flex-col gap-6">
      <Distribution arrivals={w.arrivals} total={w.customers} />
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <section
          aria-labelledby="g-deadline-title"
          className="rounded-control border-primary-soft-border bg-primary-soft flex flex-col gap-3 border px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="g-deadline-title"
              className="font-heading text-primary-soft-foreground text-lg"
            >
              Scadenza
            </h3>
            <span className="font-label text-primary-soft-foreground rounded-full bg-card px-2 py-0.5 text-xs">
              Obbligatoria
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Il giorno entro cui le chiamate assegnate andranno eseguite. Le
            chiamate con una scadenza avranno priorità rispetto a quelle senza.
          </p>
          <DeadlineField
            id="g-deadline"
            value={model.draftDeadline}
            onChange={model.setDraftDeadline}
            now={now}
            hideLabel
            prominent
          />
        </section>
      </div>
    </div>
  )
}

// ---- Assegna ----

function assignStep(
  model: WaveModel,
  split: Split,
  now: Date,
  onDone: () => void
): GStep {
  return {
    id: "assign",
    title: "Assegna",
    summary: submitText(split),
    body: <AssignBody model={model} split={split} now={now} />,
    next: {
      label: submitText(split),
      disabled: !split.plan,
      onClick: () => {
        if (!split.plan) return
        model.apply(split.plan)
        onDone()
      },
    },
  }
}

function AssignBody({
  model,
  split,
  now,
}: {
  model: WaveModel
  split: Split
  now: Date
}) {
  const deadline = model.wave.deadline ?? model.draftDeadline
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-label">
          {number(model.wave.unassigned)} da assegnare
        </span>{" "}
        <span className="text-muted-foreground">con scadenza</span>{" "}
        <span className="font-label">{dayText(deadline)}</span>
      </p>
      <div className="rounded-control flex flex-col gap-4 border border-border p-4">
        <StrategyField split={split} id="g-strategy" />
        <CountField split={split} id="g-count" />
        <SplitSummary
          split={split}
          operators={model.operators}
          id="g-count-summary"
        />
      </div>
      <SplitRows
        split={split}
        operators={model.operators}
        waveId={model.wave.id}
        workdays={workdaysFor(model, now)}
        id="g-to"
        className="rounded-control border border-border p-4 [&>ul]:max-h-[28rem]"
      />
    </div>
  )
}

// ---- Riassegna ----

function moveSteps(
  model: WaveModel,
  split: Split,
  from: readonly number[],
  setFrom: (ids: readonly number[]) => void,
  now: Date,
  onDone: () => void
): GStep[] {
  const w = model.wave
  const which = whichLabels[split.which].label
  return [
    {
      id: "from",
      title: "Da chi",
      summary:
        split.sources.length === 0
          ? "Nessuno"
          : `${
              split.sources.length <= 2
                ? andText(split.sources.map(firstName))
                : `${split.sources.length} operatori`
            } · ${number(
              split.sources.reduce((s, o) => s + waveLoad(o, w.id).toCall, 0)
            )} contatti da lavorare`,
      body: <SourcesBody model={model} from={from} setFrom={setFrom} />,
      next: { label: "Avanti", disabled: from.length === 0, onClick: moveOn },
    },
    {
      id: "what",
      title: "Quali e quanti contatti",
      summary: `${which} · ${
        split.howMany === "all"
          ? `tutti, ${number(split.value)}`
          : split.howMany === "each"
            ? `${number(Number(split.count ?? split.max))} per operatore, ${number(split.value)} in tutto`
            : `${number(split.value)} su ${number(split.available)}`
      }`,
      body: (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Scegli quali contatti spostare e quanti. I contatti spostati
            mantengono stato, alert e chat. Non si spostano i clienti in
            Richiamo, con un Appuntamento, con una Pratica caricata o Non
            interessati: restano all&apos;operatore di adesso.
          </p>
          <section
            aria-labelledby="m-which-title"
            className="rounded-control flex flex-col gap-3 border border-border p-4"
          >
            <div className="flex flex-col gap-0.5">
              <h3 id="m-which-title" className="font-label text-sm">
                Quali contatti
              </h3>
              <p className="text-xs text-muted-foreground">
                Fra quelli che gli operatori scelti devono ancora lavorare in
                questa Wave.
              </p>
            </div>
            <WhichField split={split} waveId={w.id} id="m-which" />
          </section>
          <section
            aria-labelledby="m-count-title"
            className="rounded-control flex flex-col gap-3 border border-border p-4"
          >
            <div className="flex flex-col gap-0.5">
              <h3 id="m-count-title" className="font-label text-sm">
                Quanti contatti
              </h3>
              <p className="text-xs text-muted-foreground">
                Se non li sposti tutti, si spostano prima quelli assegnati da
                più tempo.
              </p>
            </div>
            <HowManyField split={split} id="m-count" />
            {split.error &&
            split.howMany !== "all" &&
            split.error.startsWith("Da 1") ? (
              <p className="text-destructive-text text-sm">{split.error}</p>
            ) : null}
          </section>
        </div>
      ),
      next: {
        label: "Avanti",
        disabled:
          split.available === 0 ||
          split.value === 0 ||
          (split.error?.startsWith("Da 1") ?? false),
        onClick: moveOn,
      },
    },
    {
      id: "to",
      title: "A chi",
      summary: submitText(split),
      body: (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-label">
              {number(split.value)} da spostare
            </span>{" "}
            <span className="text-muted-foreground">
              da {andText(split.sources.map(firstName))}
            </span>
          </p>
          <div className="rounded-control flex flex-col gap-4 border border-border p-4">
            <StrategyField split={split} id="m-strategy" />
            <SplitSummary
              split={split}
              operators={model.operators}
              id="m-summary"
            />
          </div>
          <SplitRows
            split={split}
            operators={model.operators}
            waveId={w.id}
            workdays={workdaysFor(model, now)}
            id="m-to"
            className="rounded-control border border-border p-4 [&>ul]:max-h-[28rem]"
          />
        </div>
      ),
      next: {
        label: submitText(split),
        disabled: !split.plan,
        onClick: () => {
          if (!split.plan) return
          model.apply(split.plan, split.which)
          onDone()
        },
      },
    },
  ]
}

function SourcesBody({
  model,
  from,
  setFrom,
}: {
  model: WaveModel
  from: readonly number[]
  setFrom: (ids: readonly number[]) => void
}) {
  const rows = distributionOf(model).filter((r) => r.toDo > 0)
  const stuck = rows.filter((r) => !isActive(r.operator))
  const groups = [
    ["Inattivi", stuck],
    [
      "Operatori",
      rows.filter(
        (r) => isActive(r.operator) && r.operator.role === "OPERATORE"
      ),
    ],
    [
      "Admin",
      rows.filter((r) => isActive(r.operator) && r.operator.role === "ADMIN"),
    ],
  ] as const
  const toggle = (id: number, on: boolean) =>
    setFrom(on ? [...from, id] : from.filter((x) => x !== id))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Scegli uno o più operatori da cui prendere i contatti di questa Wave.
          <span className="font-label text-foreground">
            {" "}
            {from.length} {from.length === 1 ? "scelto" : "scelti"}
          </span>
        </p>
        <div className="flex gap-1">
          {stuck.length > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                setFrom([
                  ...new Set([...from, ...stuck.map((r) => r.operator.id)]),
                ])
              }
            >
              Scegli gli inattivi
            </Button>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={from.length === 0}
            onClick={() => setFrom([])}
          >
            Nessuno
          </Button>
        </div>
      </div>
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-2 border-b border-border px-2 pb-1 text-xs text-muted-foreground"
      >
        <span className="pl-6">Nome</span>
        <span className="text-right">Da chiamare</span>
        <span className="text-right">Non risponde</span>
        <span className="text-right">Totale</span>
      </div>
      <ul className="max-h-[30rem] overflow-y-auto">
        {groups.map(([title, list], g) =>
          list.length === 0 ? null : (
            <li key={title}>
              <p
                id={`m-from-g${g}`}
                className={cn(
                  "font-label px-2 pb-0.5 pt-2 text-xs",
                  title === "Inattivi"
                    ? "text-tag-amber-text"
                    : "text-muted-foreground"
                )}
              >
                {title}
                {title === "Inattivi"
                  ? " · conviene spostare i loro contatti"
                  : ""}
              </p>
              <ul aria-labelledby={`m-from-g${g}`}>
                {list.map((r) => (
                  <SourceRow
                    key={r.operator.id}
                    operator={r.operator}
                    never={r.never}
                    noAnswer={r.noAnswer}
                    checked={from.includes(r.operator.id)}
                    onChange={(on) => toggle(r.operator.id, on)}
                  />
                ))}
              </ul>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

function SourceRow({
  operator: o,
  never,
  noAnswer,
  checked,
  onChange,
}: {
  operator: Operator
  never: number
  noAnswer: number
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const id = `m-from-${o.id}`
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
        checked && "bg-primary-soft hover:bg-primary-soft"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(on) => onChange(on === true)}
        />
        <Label
          htmlFor={id}
          className="flex min-w-0 flex-col items-start gap-0 font-normal"
        >
          <span className="max-w-full truncate">{o.name}</span>
          <span
            className={cn(
              "text-xs",
              isActive(o) ? "text-muted-foreground" : "text-tag-amber-text"
            )}
          >
            {isActive(o) ? `${o.perDay} chiamate al giorno` : awayText(o)}
          </span>
        </Label>
      </div>
      <span className="text-right tabular-nums text-muted-foreground">
        {number(never)}
      </span>
      <span className="text-right tabular-nums text-muted-foreground">
        {number(noAnswer)}
      </span>
      <span className="font-label text-right tabular-nums">
        {number(never + noAnswer)}
      </span>
    </li>
  )
}

// ---- Outside the flows ----

function DonePanel({
  title,
  text,
  extend,
  left,
  onMore,
  onOverview,
}: {
  title: string
  text: string
  /** «Proroga», after a move on an expired Wave */
  extend?: React.ReactNode
  left: number
  onMore: () => void
  onOverview: () => void
}) {
  return (
    <section className="rounded-card border border-border bg-card shadow-card">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-tag-green-bg text-tag-green-text mb-2 flex size-16 items-center justify-center rounded-full">
          <Check aria-hidden className="size-8" />
        </span>
        <h2 className="font-heading text-2xl">{title}</h2>
        <p className="text-base text-muted-foreground">
          {text}
          {left > 0 ? ` Restano ${number(left)} senza operatore.` : ""}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {left > 0 ? (
            <Button size="lg" variant="secondary" onClick={onMore}>
              Assegna i restanti {number(left)}
            </Button>
          ) : null}
          {extend}
          <Button size="lg" onClick={onOverview}>
            Vai alla Wave
          </Button>
        </div>
      </div>
    </section>
  )
}

function Overview({
  model,
  now,
  onAssign,
  onMove,
  onReassign,
}: {
  model: WaveModel
  now: Date
  onAssign: () => void
  onMove: (from: readonly number[]) => void
  onReassign: () => void
}) {
  const rows = distributionOf(model)
  const most = Math.max(1, ...rows.map((r) => r.toDo))
  return (
    <section className="rounded-card flex flex-col gap-5 border border-border bg-card px-6 py-6 shadow-card">
      <ExpiredBanner model={model} now={now} onReassign={onReassign} />
      <Parts wave={model.wave} />
      {model.wave.unassigned > 0 ? (
        <div className="rounded-control border-tag-amber-border bg-tag-amber-bg flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm">
          <span>
            <span className="font-label">{number(model.wave.unassigned)}</span>{" "}
            clienti ancora senza operatore
          </span>
          <Button size="sm" onClick={onAssign}>
            Assegna
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg">Chi ha il da fare</h2>
          <Button size="sm" variant="secondary" onClick={onReassign}>
            Riassegna…
          </Button>
        </div>
        <ul className="flex flex-col">
          {rows.map((r) => {
            const o = r.operator
            return (
              <li
                key={o.id}
                className="grid grid-cols-[minmax(0,1fr)_8rem_10rem_6rem] items-center gap-4 border-b border-border py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-label block truncate">{o.name}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      isActive(o)
                        ? "text-muted-foreground"
                        : "text-tag-amber-text"
                    )}
                  >
                    {isActive(o)
                      ? `${number(r.never)} da chiamare · ${number(r.noAnswer)} non risponde`
                      : `${awayText(o)} · ${number(r.never)} mai chiamati`}
                  </span>
                </span>
                <div aria-hidden className="h-1.5 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      isActive(o)
                        ? "bg-muted-foreground/40"
                        : "bg-tag-amber-dot"
                    )}
                    style={{ width: `${(r.toDo / most) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">
                  {r.toDo === 0 ? (
                    <span className="text-muted-foreground">
                      Niente da fare
                    </span>
                  ) : (
                    <>
                      {number(r.toDo)}{" "}
                      <span className="text-xs text-muted-foreground">
                        da fare
                      </span>
                    </>
                  )}
                </span>
                <span className="text-right">
                  {r.toDo > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Sposta il da fare di ${o.name}`}
                      onClick={() => onMove([o.id])}
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
    </section>
  )
}
