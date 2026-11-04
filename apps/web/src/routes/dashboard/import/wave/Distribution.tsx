import { type ReactNode } from "react"
import { type WaveView } from "@/api/import"
import { cn } from "@/lib/utils"
import { formatNumber } from "./_lib/text"

/**
 * The numbers the distribution draws, from the Wave (AC5). The inner ring and
 * «Clienti importati» count every new customer; the outer ring and «Da
 * assegnare» only those without an operator. A new customer with an operator
 * is in its entry of «Già assegnati»
 */
export function distributionFigures(
  wave: Pick<WaveView, "customers" | "origin" | "toAssign" | "alreadyAssigned">
) {
  const { origin, alreadyAssigned: stay } = wave
  const created = origin.new.withOperator + origin.new.withoutOperator
  const present = origin.existing.withOperator + origin.existing.withoutOperator
  return {
    total: wave.customers,
    created,
    present,
    toAssign: wave.toAssign,
    newWithout: origin.new.withoutOperator,
    existingWithout: origin.existing.withoutOperator,
    assigned: wave.customers - wave.toAssign,
    stay,
  }
}

/** The classes are literal: Tailwind reads the source, it never sees a built class */
type Arc = { label: string; n: number; stroke: string; dot: string }

/** Where the customers go and where they come from, as the rings draw them */
function rings(figures: ReturnType<typeof distributionFigures>) {
  const { stay } = figures
  const outer: Arc[] = [
    {
      label: "Nuovi senza operatore",
      n: figures.newWithout,
      stroke: "stroke-primary",
      dot: "bg-primary",
    },
    {
      label: "Già presenti senza operatore",
      n: figures.existingWithout,
      stroke: "stroke-primary/55",
      dot: "bg-primary/55",
    },
    {
      label: "Da chiamare",
      n: stay.toCall,
      stroke: "stroke-muted-foreground/55",
      dot: "bg-muted-foreground/55",
    },
    {
      label: "Non risponde",
      n: stay.noAnswer,
      stroke: "stroke-muted-foreground/42",
      dot: "bg-muted-foreground/42",
    },
    {
      label: "Richiamo",
      n: stay.recall,
      stroke: "stroke-muted-foreground/30",
      dot: "bg-muted-foreground/30",
    },
    {
      label: "Con esito",
      n: stay.outcome,
      stroke: "stroke-muted-foreground/20",
      dot: "bg-muted-foreground/20",
    },
    {
      label: "Senza contatto",
      n: stay.noContact,
      stroke: "stroke-muted-foreground/12",
      dot: "bg-muted-foreground/12",
    },
  ]
  const inner: Arc[] = [
    {
      label: "Nuovi",
      n: figures.created,
      stroke: "stroke-tag-blue-dot",
      dot: "bg-tag-blue-dot",
    },
    {
      label: "Già presenti nel CRM",
      n: figures.present,
      stroke: "stroke-tag-blue-dot/25",
      dot: "bg-tag-blue-dot/25",
    },
  ]
  return { outer, inner }
}

/** One ring of arcs from twelve o'clock, a thin gap between them */
function Ring({
  arcs,
  total,
  r,
  width,
}: {
  arcs: readonly Arc[]
  total: number
  r: number
  width: number
}) {
  const c = 2 * Math.PI * r
  let at = 0
  return (
    <>
      {arcs.map((arc) => {
        const length = total === 0 ? 0 : (arc.n / total) * c
        const start = at
        at += length
        if (arc.n === 0) return null
        return (
          <circle
            key={arc.label}
            cx={64}
            cy={64}
            r={r}
            fill="none"
            strokeWidth={width}
            className={arc.stroke}
            strokeDasharray={`${Math.max(length - 1.2, 0)} ${c}`}
            strokeDashoffset={-start}
            transform="rotate(-90 64 64)"
          />
        )
      })}
    </>
  )
}

const nameOf = (arcs: readonly Arc[]) =>
  arcs
    // «Senza contatto» is left out of the page when it is 0 (AC5)
    .filter((arc) => arc.n > 0 || arc.label !== "Senza contatto")
    .map((arc) => `${arc.label} ${formatNumber(arc.n)}`)
    .join(", ")

function Row({
  dot,
  label,
  hint,
  n,
}: {
  dot: string
  label: string
  hint?: string
  n: number
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-baseline gap-2 py-1.5 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", dot)}
          />
          <span>{label}</span>
        </span>
        {hint ? (
          <span className="pl-3.5 text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <span className="text-right tabular-nums">{formatNumber(n)}</span>
    </li>
  )
}

/** A column: the title one level under the title of the step (AC33) */
function Column({
  title,
  n,
  text,
  children,
}: {
  title: string
  n: number
  text: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1 md:px-5 md:first:pl-0 md:last:pr-0">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-label text-sm">{title}</h4>
        <span className="font-heading text-title tabular-nums">
          {formatNumber(n)}
        </span>
      </div>
      <p className="min-h-8 text-xs text-muted-foreground">{text}</p>
      <ul className="mt-1 divide-y divide-border border-t border-border">
        {children}
      </ul>
    </section>
  )
}

/**
 * The distribution of the Wave (AC5): two rings and three columns. The outer
 * ring is where the customers go (without operator in the primary colour, the
 * rest in greys), the inner thinner one where they come from (two blues);
 * «da assegnare» in the middle. Under 1280 px the chart sits above the
 * columns, from 1280 px beside them. No amber
 */
export function Distribution({
  wave,
}: {
  wave: Pick<WaveView, "customers" | "origin" | "toAssign" | "alreadyAssigned">
}) {
  const figures = distributionFigures(wave)
  const { outer, inner } = rings(figures)
  const { stay } = figures
  const [toCall, noAnswer, recall, outcome, noContact] = outer.slice(2)
  const stayRows = [
    { arc: toCall, hint: "aspettano una chiamata" },
    { arc: noAnswer, hint: "già tentati" },
    { arc: recall, hint: "restano con il loro richiamo" },
    {
      arc: outcome,
      hint: "appuntamento, pratica caricata, non interessato",
    },
    ...(stay.noContact > 0
      ? [
          {
            arc: noContact,
            hint: "hanno un operatore ma nessun contatto aperto",
          },
        ]
      : []),
  ]
  return (
    <div className="grid items-center gap-8 xl:grid-cols-[12rem_minmax(0,1fr)]">
      <svg
        viewBox="0 0 128 128"
        role="img"
        aria-label={`Da assegnare ${formatNumber(figures.toAssign)} su ${formatNumber(figures.total)}. Per destinazione: ${nameOf(outer)}. Per provenienza: ${nameOf(inner)}`}
        className="mx-auto size-48"
      >
        <Ring arcs={outer} total={figures.total} r={54} width={12} />
        <Ring arcs={inner} total={figures.total} r={42} width={5} />
        <text
          x={64}
          y={63}
          textAnchor="middle"
          className="font-heading fill-foreground text-[17px] tabular-nums"
        >
          {formatNumber(figures.toAssign)}
        </text>
        <text
          x={64}
          y={77}
          textAnchor="middle"
          className="fill-muted-foreground text-[8.5px]"
        >
          da assegnare
        </text>
      </svg>
      <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        <Column
          title="Clienti importati"
          n={figures.total}
          text="Tutti i clienti del file. Nel grafico, l'anello interno."
        >
          <Row
            dot="bg-tag-blue-dot"
            label="Nuovi"
            hint="non erano nel CRM"
            n={figures.created}
          />
          <Row
            dot="bg-tag-blue-dot/25"
            label="Già presenti nel CRM"
            n={figures.present}
          />
        </Column>
        <Column
          title="Da assegnare"
          n={figures.toAssign}
          text="Li dividi tra gli operatori al passo «Assegna»."
        >
          <Row
            dot="bg-primary"
            label="Nuovi"
            hint="clienti che entrano con questo import"
            n={figures.newWithout}
          />
          <Row
            dot="bg-primary/55"
            label="Senza operatore"
            hint="presenti ma non assegnati ad alcun operatore"
            n={figures.existingWithout}
          />
        </Column>
        <Column
          title="Già assegnati"
          n={figures.assigned}
          text="Nella Wave e già assegnati a un operatore: dovranno essere chiamati entro la scadenza della Wave."
        >
          {stayRows.map(({ arc, hint }) =>
            arc === undefined ? null : (
              <Row
                key={arc.label}
                dot={arc.dot}
                label={arc.label}
                hint={hint}
                n={arc.n}
              />
            )
          )}
        </Column>
      </div>
    </div>
  )
}
