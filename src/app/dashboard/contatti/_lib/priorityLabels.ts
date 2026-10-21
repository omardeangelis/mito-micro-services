import { type PriorityBand } from "@mito/domain/contact/priority"

/** What each priority band is called: the filter and the detail say the same. */
export const priorityLabels = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
} as const satisfies Record<PriorityBand, string>
