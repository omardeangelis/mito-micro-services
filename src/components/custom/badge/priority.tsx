import { Badge } from "@/components/ui/badge"
import { ArrowDown, ArrowUpRight, Equal, ArrowUp } from "lucide-react"

type priorityType = "low" | "medium" | "high" | "urgent"

export const priorityEnum = ["low", "medium", "high", "urgent"] as const

const colors: Record<priorityType, string> = {
  low: "blue",
  medium: "yellow",
  high: "orange",
  urgent: "red",
}

export const priorityRangeMap: Record<priorityType, number> = {
  low: 20,
  medium: 60,
  high: 100,
  urgent: 120,
}

const getPriorityByRange = (range: number): priorityType => {
  if (range <= 20) return "low"
  if (range <= 60) return "medium"
  if (range <= 100) return "high"
  return "urgent"
}

const Icon = ({ priority }: { priority: priorityType }) => {
  switch (priority) {
    case "low":
      return <ArrowDown size={14} />
    case "medium":
      return <Equal size={14} />
    case "high":
      return <ArrowUpRight size={14} />
    case "urgent":
      return <ArrowUp size={14} />
  }
}

export const PriorityBadge: React.FC<{ priority: number }> = ({ priority }) => {
  const priorityType = getPriorityByRange(priority)
  const colorClass = `bg-${colors[priorityType]}-50 text-${colors[priorityType]}-600 border-${colors[priorityType]}-200`
  return (
    <Badge size="xs" className={colorClass}>
      <Icon priority={priorityType} />
    </Badge>
  )
}
