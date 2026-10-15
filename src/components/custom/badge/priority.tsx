import { Badge } from "@/components/ui/badge"
import { ArrowDown, ArrowUpRight, Equal, ArrowUp } from "lucide-react"
import {
  bandOf,
  bandValue,
  priorityBands,
  type PriorityBand,
} from "@/lib/domain/contact/priority"

type priorityType = PriorityBand

export const priorityEnum = priorityBands

const colors: Record<priorityType, string> = {
  low: "blue",
  medium: "yellow",
  high: "orange",
  urgent: "red",
}

export const priorityRangeMap: Record<priorityType, number> = {
  low: bandValue("low"),
  medium: bandValue("medium"),
  high: bandValue("high"),
  urgent: bandValue("urgent"),
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
  const priorityType = bandOf(priority)
  const colorClass = `bg-${colors[priorityType]}-50 text-${colors[priorityType]}-600 border-${colors[priorityType]}-200`
  return (
    <Badge size="xs" className={colorClass}>
      <Icon priority={priorityType} />
    </Badge>
  )
}
