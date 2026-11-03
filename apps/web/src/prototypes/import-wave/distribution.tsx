// Who came in with the file, on the «Ingressi» step: two rings and three
// columns at the same level, «Clienti importati», «Da assegnare» and «Già
// assegnati» (third round, "Anello doppio" kept).

import type * as React from "react"
import { cn } from "@/lib/utils"
import { number } from "../home-operatore/shared"
import { type Arrivals } from "./fixtures"

export type DistributionProps = { arrivals: Arrivals; total: number }

function figures({ arrivals: a, total }: DistributionProps) {
  const p = a.present
  const present = p.unassigned + p.never + p.noAnswer + p.callback + p.worked
  const toAssign = a.newCustomers + p.unassigned
  return { p, present, toAssign, stay: total - toAssign }
}

const stayRows = (p: Arrivals["present"]) => [
  {
    label: "Da chiamare",
    hint: "mai chiamati",
    n: p.never,
    stroke: "stroke-muted-foreground/45",
    dot: "bg-muted-foreground/45",
  },
  {
    label: "Non risponde",
    hint: "già tentati",
    n: p.noAnswer,
    stroke: "stroke-muted-foreground/35",
    dot: "bg-muted-foreground/35",
  },
  {
    label: "Richiamo",
    hint: "restano con il loro richiamo",
    n: p.callback,
    stroke: "stroke-muted-foreground/25",
    dot: "bg-muted-foreground/25",
  },
  {
    label: "Con esito",
    hint: "appuntamento, pratica caricata, non interessato",
    n: p.worked,
    stroke: "stroke-muted-foreground/15",
    dot: "bg-muted-foreground/15",
  },
]

// ---- A ring ----

type Arc = { label: string; n: number; stroke: string }

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
      {arcs.map((x) => {
        const len = (x.n / total) * c
        const start = at
        at += len
        if (x.n === 0) return null
        return (
          <circle
            key={x.label}
            cx={64}
            cy={64}
            r={r}
            fill="none"
            strokeWidth={width}
            className={x.stroke}
            strokeDasharray={`${Math.max(len - 1.2, 0)} ${c}`}
            strokeDashoffset={-start}
            transform="rotate(-90 64 64)"
          />
        )
      })}
    </>
  )
}

function Center({ n, label }: { n: string; label: string }) {
  return (
    <>
      <text
        x={64}
        y={63}
        textAnchor="middle"
        className="font-heading fill-foreground text-[17px] tabular-nums"
      >
        {n}
      </text>
      <text
        x={64}
        y={77}
        textAnchor="middle"
        className="fill-muted-foreground text-[8.5px]"
      >
        {label}
      </text>
    </>
  )
}

const ariaOf = (arcs: readonly Arc[]) =>
  arcs.map((x) => `${x.label} ${number(x.n)}`).join(", ")

function Row({
  dot,
  label,
  hint,
  n,
  strong = false,
}: {
  dot: string
  label: string
  hint?: string
  n: number
  strong?: boolean
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-baseline gap-2 py-1.5 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", dot)}
          />
          <span className={cn(strong && "font-label")}>{label}</span>
        </span>
        {hint ? (
          <span className="pl-3.5 text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <span className={cn("text-right tabular-nums", strong && "font-label")}>
        {number(n)}
      </span>
    </li>
  )
}

/**
 * Two rings: inside, where the clients come from (new, already in the CRM);
 * outside, where they go (to assign in the primary colour, already assigned
 * in grey). «Da assegnare» in the middle; the three columns read the rings
 */
export function Distribution(props: DistributionProps) {
  const { arrivals: a, total } = props
  const { p, present, toAssign, stay } = figures(props)
  const stays = stayRows(p)
  const outer: Arc[] = [
    { label: "Nuovi", n: a.newCustomers, stroke: "stroke-primary" },
    { label: "Senza operatore", n: p.unassigned, stroke: "stroke-primary/55" },
    ...stays,
  ]
  const inner: Arc[] = [
    { label: "Nuovi", n: a.newCustomers, stroke: "stroke-tag-blue-dot" },
    {
      label: "Già presenti nel CRM",
      n: present,
      stroke: "stroke-tag-blue-dot/25",
    },
  ]
  return (
    <div className="grid items-center gap-8 xl:grid-cols-[12rem_minmax(0,1fr)]">
      <svg
        viewBox="0 0 128 128"
        role="img"
        aria-label={`Da assegnare ${number(toAssign)} su ${number(total)}: ${ariaOf(outer)}. Provenienza: ${ariaOf(inner)}`}
        className="mx-auto size-48"
      >
        <Ring arcs={outer} total={total} r={54} width={12} />
        <Ring arcs={inner} total={total} r={42} width={5} />
        <Center n={number(toAssign)} label="da assegnare" />
      </svg>
      <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        <Column
          title="Clienti importati"
          n={total}
          text="Tutti i clienti del file. Nel grafico, l'anello interno."
        >
          <Row
            dot="bg-tag-blue-dot"
            label="Nuovi"
            hint="non erano nel CRM"
            n={a.newCustomers}
          />
          <Row
            dot="bg-tag-blue-dot/25"
            label="Già presenti nel CRM"
            n={present}
          />
        </Column>
        <Column
          title="Da assegnare"
          n={toAssign}
          text="Li dividi tra gli operatori al passo «Assegna»."
        >
          <Row
            dot="bg-primary"
            label="Nuovi"
            hint="clienti che entrano con questo import"
            n={a.newCustomers}
          />
          <Row
            dot="bg-primary/55"
            label="Senza operatore"
            hint="presenti ma non assegnati ad alcun operatore"
            n={p.unassigned}
          />
        </Column>
        <Column
          title="Già assegnati"
          n={stay}
          text="Nella Wave e già assegnati a un operatore: dovranno essere chiamati entro la scadenza della Wave."
        >
          {stays.map((r) => (
            <Row key={r.label} {...r} />
          ))}
        </Column>
      </div>
    </div>
  )
}

function Column({
  title,
  n,
  text,
  children,
}: {
  title: string
  n: number
  text: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1 md:px-5 md:first:pl-0 md:last:pr-0">
      <h4 className="flex items-baseline justify-between gap-2">
        <span className="font-label text-sm">{title}</span>
        <span className="font-heading text-title tabular-nums">
          {number(n)}
        </span>
      </h4>
      <p className="min-h-8 text-xs text-muted-foreground">{text}</p>
      <ul className="mt-1 divide-y divide-border border-t border-border">
        {children}
      </ul>
    </section>
  )
}
