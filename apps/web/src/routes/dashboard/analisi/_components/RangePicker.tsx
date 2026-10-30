import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { type DateRange } from "react-day-picker"
import { it } from "react-day-picker/locale"
import { formatRange } from "@mito/domain/analytics/buckets"
import {
  daysIn,
  type DayRange,
  MAX_WINDOW_DAYS,
  validateWindow,
} from "@mito/domain/analytics/window"
import { addDays } from "@mito/domain/utils/calendarDays"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const two = (value: number) => String(value).padStart(2, "0")

/** The day `YYYY-MM-DD` as the date at its midnight, where the calendar works */
function dateOf(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

/** The day `YYYY-MM-DD` of a date of the calendar */
const dayOf = (date: Date) =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`

const dayCount = (count: number) =>
  `${count} ${count === 1 ? "giorno" : "giorni"}`

/**
 * The next draft after a click on `day`: the first click starts a window,
 * the second closes it (the same day twice is a window of one day, a day
 * before the first swaps them). A click that would make a window the page
 * can't take starts a new one from that day (AC9)
 */
function nextDraft(
  draft: DateRange | undefined,
  day: string,
  today: string
): { from: string; to: string | null } {
  const from = draft?.from === undefined ? null : dayOf(draft.from)
  if (from === null || draft?.to !== undefined) return { from: day, to: null }
  const [first, last] = day < from ? [day, from] : [from, day]
  return validateWindow({ from: first, to: last }, today) === null
    ? { from: day, to: null }
    : { from: first, to: last }
}

/** The days the calendar can't pick: after today, and too far from the first day of a window half chosen (AC9) */
function disabledDays(draft: DateRange | undefined, today: string) {
  const after = [{ after: dateOf(today) }]
  if (draft?.from === undefined || draft.to !== undefined) return after
  const from = dayOf(draft.from)
  const reach = MAX_WINDOW_DAYS - 1
  return [
    ...after,
    { after: dateOf(addDays(from, reach)) },
    { before: dateOf(addDays(from, -reach)) },
  ]
}

/**
 * What is inside the popover. It mounts each time the calendar opens, so the
 * draft starts from the window of the page and the calendar shows its months
 */
function RangeCalendar({
  window,
  today,
  onApply,
}: {
  window: DayRange
  today: string
  onApply: (window: DayRange) => void
}) {
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: dateOf(window.from),
    to: dateOf(window.to),
  })
  const picked =
    draft?.from === undefined || draft.to === undefined
      ? null
      : validateWindow({ from: dayOf(draft.from), to: dayOf(draft.to) }, today)

  return (
    <>
      <Calendar
        mode="range"
        locale={it}
        weekStartsOn={1}
        numberOfMonths={2}
        // The months before the end of the window: the end and the month
        // that leads to it
        defaultMonth={dateOf(addDays(`${window.to.slice(0, 8)}01`, -1))}
        endMonth={dateOf(today)}
        selected={draft}
        // `max` of react-day-picker counts nights and restarts the window by
        // itself: the page works from the day clicked, and `disabled` keeps
        // the window within 366 days
        onSelect={(_range, date) => {
          const next = nextDraft(draft, dayOf(date), today)
          setDraft({
            from: dateOf(next.from),
            to: next.to === null ? undefined : dateOf(next.to),
          })
        }}
        disabled={disabledDays(draft, today)}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border p-3">
        {/* The window chosen, said as it changes (AC42) */}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {picked === null
            ? draft?.from === undefined || draft.to !== undefined
              ? "Scegli il primo e l'ultimo giorno"
              : `${formatRange({ from: dayOf(draft.from), to: dayOf(draft.from) })} · scegli l'ultimo giorno`
            : `${formatRange(picked)} · ${dayCount(daysIn(picked))}`}
        </p>
        <Button
          size="sm"
          disabled={picked === null}
          onClick={() => {
            if (picked !== null) onApply(picked)
          }}
        >
          Applica
        </Button>
      </div>
    </>
  )
}

/**
 * The dates of the window and the calendar that changes them (AC9, AC42).
 * `open` is the page's, so the menu of the periods can open it. «Applica»
 * and Esc close it and the focus goes back to the button (the trigger)
 */
export function RangePicker({
  window,
  today,
  custom,
  open,
  onOpenChange,
  onApply,
}: {
  window: DayRange
  today: string
  /** Whether the window was picked by hand */
  custom: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (window: DayRange) => void
}) {
  const range = formatRange(window)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Date: ${range}, scegli dal calendario`}
          className={cn("max-w-full font-normal", custom && "border-ring")}
        >
          <CalendarIcon aria-hidden="true" />
          {range}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        aria-label="Date personalizzate"
        className="w-auto max-w-[calc(100vw-1rem)] p-0"
      >
        <RangeCalendar
          window={window}
          today={today}
          onApply={(next) => {
            onApply(next)
            onOpenChange(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
