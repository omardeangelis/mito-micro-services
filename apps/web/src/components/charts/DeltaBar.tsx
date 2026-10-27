import { cn } from "@/lib/utils"
import { chartColor } from "./palette"

/**
 * Tremor's DeltaBar: a bar from the middle, to the right in emerald for a
 * value from 0 up, to the left in rose below 0. `value` goes from -100 to 100
 */
export const DeltaBar = ({
  value,
  className,
}: {
  value: number
  className?: string
}) => {
  const width = `${Math.min(Math.abs(value), 100)}%`
  return (
    <div
      className={cn(
        "relative flex h-2 w-full items-center rounded-full bg-[#f3f4f6]",
        className
      )}
    >
      <div className="flex h-full w-1/2 justify-end">
        {value < 0 ? (
          <div
            data-testid="delta-negative"
            className="rounded-l-full"
            style={{ width, backgroundColor: chartColor("rose") }}
          />
        ) : null}
      </div>
      <div className="z-10 h-4 w-1 rounded-full bg-[#374151] ring-2 ring-white" />
      <div className="flex h-full w-1/2 justify-start">
        {value >= 0 ? (
          <div
            data-testid="delta-positive"
            className="rounded-r-full"
            style={{ width, backgroundColor: chartColor("emerald") }}
          />
        ) : null}
      </div>
    </div>
  )
}
