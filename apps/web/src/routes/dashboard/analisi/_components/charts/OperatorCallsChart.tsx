import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { DASH } from "../../_lib/results"
import { type CallsPoint, type RatePoint } from "../../_lib/trends"
import {
  activeDotOf,
  ANSWERED,
  axisProps,
  axisTick,
  barCursor,
  chartRoot,
  COMPARISON,
  ComparisonLine,
  count,
  dotOf,
  lineCursor,
  NEUTRAL,
  NO_ANSWER,
  paint,
  percent,
  PointTooltip,
  RATE,
  separated,
  timeAxisProps,
  timeMargin,
} from "./parts"

/**
 * The operator's «Risposte per operatore», in time (AC18): a stacked bar per
 * interval (with an answer, without), separated by a line of the card (AC40),
 * and the calls of the comparison as a dashed line
 */
export function MyCallsChart({
  points,
  compared,
}: {
  points: CallsPoint[]
  compared: boolean
}) {
  return (
    <ChartContainer className="h-full w-full">
      <ComposedChart data={points} margin={timeMargin} {...chartRoot}>
        <CartesianGrid vertical={false} stroke="none" />
        <XAxis {...timeAxisProps} />
        <YAxis
          width={48}
          {...axisProps}
          tick={axisTick}
          allowDecimals={false}
          tickFormatter={count}
        />
        <PointTooltip<CallsPoint>
          cursor={barCursor}
          label={(point) => point.longLabel}
          items={(point) => [
            {
              name: "Con risposta",
              value: count(point.answered),
              color: ANSWERED,
            },
            {
              name: "Senza risposta",
              value: count(point.noAnswer),
              color: NO_ANSWER,
            },
            ...(compared
              ? [
                  {
                    name: "Chiamate confronto",
                    value:
                      point.comparisonCalls === null
                        ? DASH
                        : count(point.comparisonCalls),
                    color: COMPARISON,
                  },
                ]
              : []),
          ]}
        />
        <Bar
          dataKey="answered"
          stackId="calls"
          {...separated(ANSWERED)}
          isAnimationActive={false}
        />
        <Bar
          dataKey="noAnswer"
          stackId="calls"
          {...separated(NO_ANSWER)}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        {compared ? <ComparisonLine dataKey="comparisonCalls" /> : null}
      </ComposedChart>
    </ChartContainer>
  )
}

type DotArgs = {
  cx?: number
  cy?: number
  index?: number
  payload?: RatePoint
}

/** A dot of the rate: neutral for a small sample (AC18), none for a gap (AC24) */
function RateDot({ cx, cy, payload }: DotArgs) {
  if (cx === undefined || cy === undefined || payload?.rate == null)
    return <g />
  return (
    <circle
      cx={cx}
      cy={cy}
      {...dotOf(payload.small ? NEUTRAL : RATE)}
      className="recharts-dot"
    />
  )
}

/**
 * The operator's «Tasso di appuntamento», in time (AC18): a line with dots of
 * the rate, the comparison dashed. An interval without answers is a gap
 * (AC24), one with fewer than 15 has a neutral dot
 */
export function MyAppointmentsChart({
  points,
  compared,
}: {
  points: RatePoint[]
  compared: boolean
}) {
  return (
    <ChartContainer className="h-full w-full">
      <LineChart data={points} margin={timeMargin} {...chartRoot}>
        <CartesianGrid vertical={false} stroke="none" />
        <XAxis {...timeAxisProps} />
        <YAxis
          width={56}
          {...axisProps}
          tick={axisTick}
          domain={[0, "auto"]}
          tickFormatter={(value: number) => percent(value)}
        />
        <PointTooltip<RatePoint>
          cursor={lineCursor}
          label={(point) => point.longLabel}
          items={(point) => [
            {
              name: point.small ? "Tasso (campione piccolo)" : "Tasso",
              value: percent(point.rate),
              color: point.small ? NEUTRAL : RATE,
            },
            ...(compared
              ? [
                  {
                    name: "Confronto",
                    value: percent(point.comparisonRate),
                    color: COMPARISON,
                  },
                ]
              : []),
          ]}
        />
        {compared ? <ComparisonLine dataKey="comparisonRate" /> : null}
        <Line
          dataKey="rate"
          type="monotone"
          {...paint({ stroke: RATE })}
          strokeWidth={2}
          dot={(props: DotArgs) => <RateDot key={props.index} {...props} />}
          activeDot={activeDotOf(RATE)}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
