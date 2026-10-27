import { type ComponentProps, type ReactNode } from "react"
import { ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

// The chart component of shadcn, reduced to what the dashboard uses (R4):
// a measured container, the tooltip frame and the legend. The colors come
// from the chart (palette.ts), not from CSS variables: they are few and fixed

export const ChartContainer = ({
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  children: ComponentProps<typeof ResponsiveContainer>["children"]
}) => (
  <div
    className={cn(
      "[&_.recharts-surface]:outline-hidden [&_.recharts-sector]:outline-hidden flex justify-center text-xs [&_.recharts-cartesian-grid_line]:stroke-[#e5e7eb]",
      className
    )}
    {...props}
  >
    {/* jsdom measures nothing: initialDimension draws the chart in the tests */}
    <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
      {children}
    </ResponsiveContainer>
  </div>
)

export type ChartTooltipItem = {
  name: string
  value: string
  color: string
}

/** The frame of the tooltip of Tremor: a header and one row per series */
export const ChartTooltipContent = ({
  label,
  items,
}: {
  label?: ReactNode
  items: ChartTooltipItem[]
}) => (
  <div className="rounded-lg border border-[#e5e7eb] bg-white text-sm shadow-[0_4px_6px_-1px_rgb(0_0_0/0.1),0_2px_4px_-2px_rgb(0_0_0/0.1)]">
    {label !== undefined ? (
      <div className="border-b border-[#e5e7eb] px-4 py-2">
        <p className="font-medium text-[#374151]">{label}</p>
      </div>
    ) : null}
    <div className="space-y-1 px-4 py-2">
      {items.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-8"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-[0_4px_6px_-1px_rgb(0_0_0/0.1),0_2px_4px_-2px_rgb(0_0_0/0.1)]"
              style={{ backgroundColor: item.color }}
            />
            <p className="whitespace-nowrap text-right text-[#6b7280]">
              {item.name}
            </p>
          </div>
          <p className="whitespace-nowrap text-right font-medium tabular-nums text-[#374151]">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  </div>
)

/** The legend of Tremor: a dot and the name of each series, on the right */
export const ChartLegendContent = ({
  items,
}: {
  items: { name: string; color: string }[]
}) => (
  <ol className="flex flex-wrap justify-end gap-x-4 pb-4">
    {items.map((item) => (
      <li key={item.name} className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="whitespace-nowrap text-sm text-[#6b7280]">
          {item.name}
        </span>
      </li>
    ))}
  </ol>
)
