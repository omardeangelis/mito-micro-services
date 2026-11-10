import { useRef, useState } from "react"
import { Link } from "react-router"
import { adminHomeKeys, type CallTrendPeriod, useCallTrend } from "@/api/home"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { type CallTrend as CallTrendData } from "@mito/contract/home"
import {
  periodRate,
  periodText,
  todayLabel,
  type TrendBar,
  type TrendChart as TrendChartId,
  trendBars,
  trendEmpty,
  trendHref,
  type TrendKind,
} from "../../_lib/callTrend"
import { partState } from "../../_lib/part"
import { AdminPart } from "../AdminPart"
import { CHART_REM, TrendChart } from "./TrendChart"

/** The periods of the selector, in order (AC3) */
const PERIODS: ReadonlyArray<{ value: CallTrendPeriod; label: string }> = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7 giorni" },
  { value: "30d", label: "30 giorni" },
  { value: "90d", label: "90 giorni" },
]

/** The two charts, in order (AC5) */
const CHARTS: ReadonlyArray<{
  kind: TrendKind
  chart: TrendChartId
  title: string
}> = [
  { kind: "answer", chart: "calls", title: "Tasso di risposta" },
  {
    kind: "appointment",
    chart: "appointments",
    title: "Tasso di appuntamento",
  },
]

/**
 * The title row and the rate of the period above a chart, in rem, on one line
 * each. They grow when their text wraps (larger text, a narrow column), so it
 * never covers the chart
 */
const HEAD_REM = 1.5
const RATE_REM = 1.25
const GAP_REM = 0.25
/** A chart with its head on one line each: the skeleton has this height (AC12) */
const PANEL_REM = HEAD_REM + GAP_REM + RATE_REM + GAP_REM + CHART_REM

const titleId = (chart: TrendChartId) => `andamento-${chart}-title`

/** The title of a chart and its «Dettaglio in Analisi» (AC10) */
function ChartHead({
  period,
  chart,
  title,
}: {
  period: CallTrendPeriod
  chart: TrendChartId
  title: string
}) {
  return (
    <div
      style={{ minHeight: `${HEAD_REM}rem` }}
      className="flex flex-wrap items-center justify-between gap-x-3"
    >
      <h3 id={titleId(chart)} className="text-sm font-medium">
        {title}
      </h3>
      <Link
        to={trendHref(period, chart)}
        aria-describedby={titleId(chart)}
        className="text-link underline-offset-3 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Dettaglio in Analisi
      </Link>
    </div>
  )
}

/** A chart with its title, the rate of the period (AC8) and the link */
function ChartPanel({
  bars,
  period,
  kind,
  chart,
  title,
}: {
  bars: TrendBar[]
  period: CallTrendPeriod
  kind: TrendKind
  chart: TrendChartId
  title: string
}) {
  const label = PERIODS.find((item) => item.value === period)?.label ?? ""
  return (
    <div
      className="flex min-w-0 flex-col"
      style={{ gap: `${GAP_REM}rem`, minHeight: `${PANEL_REM}rem` }}
    >
      <ChartHead period={period} chart={chart} title={title} />
      <p
        style={{ minHeight: `${RATE_REM}rem` }}
        className="text-sm text-muted-foreground"
      >
        {periodText(periodRate(bars, kind), kind)}
      </p>
      <TrendChart
        bars={bars}
        kind={kind}
        period={period}
        name={`${title}, ${label}`}
      />
    </div>
  )
}

/** The two charts, or what replaces them, with the links still there (AC11) */
function TrendBody({ trend }: { trend: CallTrendData }) {
  const empty = trendEmpty(trend)
  if (empty) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
          {CHARTS.map((item) => (
            <ChartHead key={item.chart} period={trend.period} {...item} />
          ))}
        </div>
        <div
          style={{ height: `${PANEL_REM - HEAD_REM - GAP_REM}rem` }}
          className="rounded-control flex flex-col items-center justify-center gap-2 border border-dashed border-border text-sm text-muted-foreground"
        >
          <p>{empty.title}</p>
          {empty.action ? (
            <Link
              to={empty.action.href}
              className="text-link underline-offset-3 rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {empty.action.label}
            </Link>
          ) : null}
        </div>
      </div>
    )
  }
  const bars = trendBars(trend)
  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
      {CHARTS.map((item) => (
        <ChartPanel
          key={item.chart}
          bars={bars}
          period={trend.period}
          {...item}
        />
      ))}
    </div>
  )
}

/** The place of the two charts, so the data don't move the page (AC12) */
function TrendSkeleton() {
  return (
    <div role="status" className="px-5 py-4">
      <span className="sr-only">Caricamento dell'andamento delle chiamate</span>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {CHARTS.map((item) => (
          <Skeleton
            key={item.chart}
            // A steady block for whoever asks for less motion
            className="w-full motion-reduce:animate-none"
            style={{ height: `${PANEL_REM}rem` }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * «Andamento delle chiamate» (spec andamenti-chiamate, D8): the rates of the
 * team per interval of a period. The period opens on «7 giorni» and is not
 * remembered (AC3); each period is its own read, with no data of another one
 * on screen while it loads
 */
export function CallTrend() {
  const title = useRef<HTMLHeadingElement>(null)
  const [period, setPeriod] = useState<CallTrendPeriod>("7d")
  const trend = useCallTrend(period)
  const hours =
    partState(trend) === "data" && trend.data ? todayLabel(trend.data) : null
  return (
    <section
      aria-labelledby="andamento-chiamate-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border px-5 py-3">
        <h2
          id="andamento-chiamate-title"
          ref={title}
          tabIndex={-1}
          className="font-heading text-lg outline-none"
        >
          Andamento delle chiamate
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {hours ? (
            <span className="text-sm text-muted-foreground">{hours}</span>
          ) : null}
          <ToggleGroup
            type="single"
            size="sm"
            value={period}
            onValueChange={(value) => {
              // A click on the chosen item empties the value: the period stays
              const chosen = PERIODS.find((item) => item.value === value)
              if (chosen) setPeriod(chosen.value)
            }}
            aria-label="Periodo"
            // In a narrow header the periods wrap instead of leaving the card
            className="max-w-full flex-wrap"
          >
            {PERIODS.map(({ value, label }) => (
              // The chosen period changes at once: no fade (AC12)
              <ToggleGroupItem
                key={value}
                value={value}
                className="transition-none"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </header>
      <AdminPart
        query={trend}
        retryKey={adminHomeKeys.callTrend(period)}
        what="l'andamento delle chiamate"
        focus={title}
        loading={<TrendSkeleton />}
        inset
      >
        {(data) => (
          <div className="px-5 py-4">
            <TrendBody trend={data} />
          </div>
        )}
      </AdminPart>
    </section>
  )
}
