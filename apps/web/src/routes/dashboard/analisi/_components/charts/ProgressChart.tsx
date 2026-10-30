import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { type ProgressPoint } from "../../_lib/rankings"
import { ratio } from "../../_lib/results"
import { chartRoot, count, CURRENT, paint, percent } from "./parts"

/**
 * «Contatti con esito» («Radial · Text»): one radial bar of the share with an
 * outcome over a neutral track, the percentage in the center, and the two
 * counts beside it (AC3, AC7)
 */
export function ProgressChart({ point }: { point: ProgressPoint }) {
  const share = ratio(point.done, point.done + point.todo)
  return (
    <div className="flex h-full w-full items-center justify-center gap-8">
      <div className="relative aspect-square h-full max-h-56">
        <ChartContainer className="h-full w-full">
          <RadialBarChart
            data={[{ value: share ?? 0 }]}
            startAngle={90}
            endAngle={-270}
            innerRadius="78%"
            outerRadius="100%"
            barSize={14}
            {...chartRoot}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
              stroke="none"
            />
            <RadialBar
              dataKey="value"
              cornerRadius={10}
              {...paint({ fill: CURRENT })}
              // The track: the soft chart token, not recharts' #eee (AC41)
              background={{ fill: "none", className: "fill-chart-1-soft" }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ChartContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-3xl tabular-nums">
            {percent(share)}
          </span>
          <span className="text-xs text-muted-foreground">con esito</span>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CURRENT }}
          />
          <dt className="text-muted-foreground">Con esito</dt>
          <dd className="ml-auto pl-4 tabular-nums">{count(point.done)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-chart-1-soft h-2.5 w-2.5 rounded-full"
          />
          <dt className="text-muted-foreground">Da chiamare</dt>
          <dd className="ml-auto pl-4 tabular-nums">{count(point.todo)}</dd>
        </div>
      </dl>
    </div>
  )
}
