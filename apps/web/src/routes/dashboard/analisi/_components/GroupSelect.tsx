import {
  allowedGroups,
  GROUPS,
  type Group,
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
}

/**
 * «Raggruppa per» (AC13), for the charts in time: the choices the window
 * doesn't allow are there, disabled. It only regroups what the browser has
 */
export function GroupSelect({
  group,
  days,
  onChange,
}: {
  group: Group
  /** How many days the window spans */
  days: number
  onChange: (group: Group) => void
}) {
  const allowed = allowedGroups(days)
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
        {GROUPS.map((item) => (
          <SelectItem
            key={item}
            value={item}
            disabled={!allowed.includes(item)}
          >
            {GROUP_LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
