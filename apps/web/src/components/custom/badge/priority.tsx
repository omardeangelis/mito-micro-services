import { bandOf, type PriorityBand } from "@mito/domain/contact/priority"
import { cn } from "@/lib/utils"

const levels: Record<PriorityBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

// Each class is written in full: the color gate and Tailwind read the sources
const heights = ["h-1", "h-1.75", "h-2.5", "h-3"]
const unlit = "bg-border-strong"
const lit: Record<PriorityBand, string> = {
  low: "bg-muted-foreground",
  medium: "bg-muted-foreground",
  high: "bg-muted-foreground",
  urgent: "bg-destructive-text",
}

// Four bars, as many lit as the level; the band name stays where it is today
export const PriorityBadge: React.FC<{ priority: number }> = ({ priority }) => {
  const band = bandOf(priority)
  const level = levels[band]
  return (
    <span
      data-level={level}
      aria-hidden="true"
      className="inline-flex items-end gap-0.5"
    >
      {heights.map((height, i) => (
        <span
          key={height}
          className={cn(
            "w-0.75 rounded-[1px]",
            height,
            i < level ? lit[band] : unlit
          )}
        />
      ))}
    </span>
  )
}
