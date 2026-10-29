import { cn } from "@/lib/utils"

/**
 * Tremor's DeltaBar: a bar from the middle, to the right in the green dot for
 * a value from 0 up, to the left in the red dot below 0. `value` goes from
 * -100 to 100
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
        "relative flex h-2 w-full items-center rounded-full bg-muted",
        className
      )}
    >
      <div className="flex h-full w-1/2 justify-end">
        {value < 0 ? (
          <div
            data-testid="delta-negative"
            className="bg-tag-red-dot rounded-l-full"
            style={{ width }}
          />
        ) : null}
      </div>
      <div className="z-10 h-4 w-1 rounded-full bg-foreground ring-2 ring-card" />
      <div className="flex h-full w-1/2 justify-start">
        {value >= 0 ? (
          <div
            data-testid="delta-positive"
            className="bg-tag-green-dot rounded-r-full"
            style={{ width }}
          />
        ) : null}
      </div>
    </div>
  )
}
