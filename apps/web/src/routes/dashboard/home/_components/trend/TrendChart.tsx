import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { type CallTrendPeriod } from "@/api/home"
import {
  ANSWERED,
  axisProps,
  axisTick,
  barCursor,
  paint,
  pointOf,
  RATE,
  type TipArgs,
} from "../../../analisi/_components/charts/parts"
import { barText, type TrendBar, type TrendKind } from "../../_lib/callTrend"

/** The height of a chart, in rem: the skeleton keeps it (AC12) */
export const CHART_REM = 12

const DATA_KEY = {
  answer: "answerRate",
  appointment: "appointmentRate",
} as const satisfies Record<TrendKind, keyof TrendBar>

const COLOR = { answer: ANSWERED, appointment: RATE } as const

/** «08:00–09:00 (in corso)» is the tooltip's: the axis keeps the start */
const tickOf = (period: CallTrendPeriod) =>
  period === "today"
    ? (label: string) => label.split("–")[0] ?? label
    : (label: string) => label

/** A rate of 0% gets 2 px, so it shows; a gap stays empty (AC6) */
const minPointSize = (value: number | null | undefined) => (value === 0 ? 2 : 0)

/**
 * A rate per interval as vertical bars (AC5, D7). The library's accessibility
 * layer is on: the surface is a tab stop named `name`, the arrows move the
 * active bar and the tooltip follows it (AC7). An interval without a value is
 * `null`, which recharts leaves empty (AC6). Nothing animates (AC12)
 */
export function TrendChart({
  bars,
  kind,
  period,
  name,
}: {
  bars: TrendBar[]
  kind: TrendKind
  period: CallTrendPeriod
  name: string
}) {
  return (
    <ChartContainer
      style={{ height: `${CHART_REM}rem` }}
      // The ring of the design system on the focused surface (D7)
      className="[&_.recharts-surface:focus-visible]:outline-solid w-full [&_.recharts-surface:focus-visible]:rounded-sm [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring"
    >
      <BarChart
        data={bars}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        accessibilityLayer
        title={name}
        aria-label={name}
      >
        <XAxis
          dataKey="label"
          {...axisProps}
          tick={axisTick}
          tickFormatter={tickOf(period)}
          minTickGap={16}
          tickMargin={8}
        />
        <YAxis
          {...axisProps}
          tick={axisTick}
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickFormatter={(value: number) => `${value}%`}
          width={44}
        />
        <Tooltip
          isAnimationActive={false}
          // A gap has its tooltip too, which says why it is empty
          filterNull={false}
          wrapperStyle={{ outline: "none" }}
          cursor={barCursor}
          content={(args: TipArgs) => {
            const bar = pointOf<TrendBar>(args)
            if (!args.active || bar === undefined) return null
            return (
              <div className="shadow-pop rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                {barText(bar, kind)}
              </div>
            )
          }}
        />
        <Bar
          dataKey={DATA_KEY[kind]}
          radius={[4, 4, 0, 0]}
          minPointSize={minPointSize}
          {...paint({ fill: COLOR[kind] })}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
