import { useId } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { counted } from "../../_lib/results"
import { type TrendPoint } from "../../_lib/trends"
import {
  activeDotOf,
  axisProps,
  axisTick,
  chartRoot,
  COMPARISON,
  ComparisonLine,
  CURRENT,
  dotOf,
  euro,
  euroTick,
  lineCursor,
  paint,
  PointTooltip,
  timeAxisProps,
  timeMargin,
} from "./parts"

/** Dots on the line up to this many intervals; past it they crowd the line */
const MAX_DOTS = 40

/**
 * «Finanziato totale» (an area, «Area · Interactive») and «Finanziato medio
 * per pratica» (a line with dots, «Line · Dots»), with the comparison as a
 * dashed line without fill (AC3). A null is a gap, never a zero (AC24)
 */
export function TrendChart({
  points,
  kind,
  compared,
}: {
  points: TrendPoint[]
  kind: "area" | "line"
  compared: boolean
}) {
  const gradient = `analisi-area-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const dots = points.length <= MAX_DOTS

  const tooltip = (
    <PointTooltip<TrendPoint>
      cursor={lineCursor}
      label={(point) => point.longLabel}
      items={(point) => [
        {
          name:
            kind === "area"
              ? `Finestra · ${counted(point.practices, "pratica", "pratiche")}`
              : `Media su ${counted(point.practices, "pratica", "pratiche")}`,
          value: euro(point.current),
          color: CURRENT,
        },
        ...(compared
          ? [
              {
                name: "Confronto",
                value: euro(point.comparison),
                color: COMPARISON,
              },
            ]
          : []),
      ]}
    />
  )

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="none" />
      <XAxis {...timeAxisProps} />
      <YAxis
        width={72}
        {...axisProps}
        tick={axisTick}
        tickFormatter={euroTick}
      />
    </>
  )

  const comparison = compared ? <ComparisonLine dataKey="comparison" /> : null

  const current = (
    <Line
      dataKey="current"
      type="monotone"
      {...paint({ stroke: CURRENT })}
      strokeWidth={2}
      dot={kind === "line" && dots ? dotOf(CURRENT) : false}
      activeDot={activeDotOf(CURRENT)}
      connectNulls={false}
      isAnimationActive={false}
    />
  )

  return (
    <ChartContainer className="h-full w-full">
      {kind === "area" ? (
        <ComposedChart data={points} margin={timeMargin} {...chartRoot}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                style={{ stopColor: CURRENT, stopOpacity: 0.28 }}
              />
              <stop
                offset="95%"
                style={{ stopColor: CURRENT, stopOpacity: 0.02 }}
              />
            </linearGradient>
          </defs>
          {axes}
          {tooltip}
          {comparison}
          {/* The fill alone: the line of the window is the Line above it */}
          <Area
            dataKey="current"
            type="monotone"
            fill={`url(#${gradient})`}
            fillOpacity={1}
            stroke="none"
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
            tooltipType="none"
          />
          {current}
        </ComposedChart>
      ) : (
        <LineChart data={points} margin={timeMargin} {...chartRoot}>
          {axes}
          {tooltip}
          {comparison}
          {current}
        </LineChart>
      )}
    </ChartContainer>
  )
}
