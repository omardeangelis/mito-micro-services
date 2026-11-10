import {
  allowedGroups,
  GROUPS,
  type Group,
  type Range,
} from "@mito/domain/analytics/window"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { oneOf } from "../_lib/urlState"

const GROUP_LABELS: Record<Group, string> = {
  auto: "Automatico",
  day: "Per giorno",
  week: "Per settimana",
  month: "Per mese",
  hour: "Per ora",
}

/**
 * «Raggruppa per» (AC13), for the charts in time: the choices the window
 * doesn't allow are there, disabled. It only regroups what the browser has
 */
export function GroupSelect({
  group,
  days,
  range,
  onChange,
}: {
  group: Group
  /** How many days the window spans */
  days: number
  /** The period: «Per ora» is there only with «Oggi» (AC19) */
  range: Range
  onChange: (group: Group) => void
}) {
  const allowed = allowedGroups(days, range)
  return (
    <Select
      value={group}
      onValueChange={(value) => {
        const next = oneOf(GROUPS, value)
        if (next !== undefined) onChange(next)
      }}
    >
      <SelectTrigger size="sm" aria-label="Raggruppa per" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {GROUPS.filter((item) => item !== "hour" || range === "today").map(
          (item) => (
            <SelectItem
              key={item}
              value={item}
              disabled={!allowed.includes(item)}
            >
              {GROUP_LABELS[item]}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  )
}
