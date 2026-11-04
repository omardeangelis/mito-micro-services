import { CalendarDays } from "lucide-react"
import { useId, useState } from "react"
import { shortcuts, workdaysLeft, type Day } from "@mito/domain/wave/days"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { dateOf, dayOf, dayText, workdaysText } from "./_lib/text"

/**
 * The day of a deadline (AC6, AC20, AC33): a button with the day, named
 * «<label>, <giorno>», and beside it «<N> giorni lavorativi». It opens a
 * popover named `title` with the shortcuts, off when they fall before `min`,
 * and the calendar, where the days before `min` can't be chosen. Choosing a
 * day closes it. The first step takes it with `min` tomorrow, «Proroga» with
 * the day after the deadline
 */
export function DeadlineField({
  value,
  onChange,
  today,
  min,
  label = "Scadenza",
  hideLabel = false,
  title = "Scegli la scadenza",
  prominent = false,
  disabled = false,
}: {
  value: Day
  onChange: (day: Day) => void
  /** Today in Rome, from the Wave (`WaveView.today`) */
  today: Day
  /** The first day that can be chosen */
  min: Day
  /** «Scadenza», «Nuova scadenza»: the start of the button's name */
  label?: string
  /** No visible label, where a title already says it */
  hideLabel?: boolean
  /** The name of the popover */
  title?: string
  /** Larger, where the deadline is the decision of the step */
  prominent?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const choose = (day: Day) => {
    onChange(day)
    setOpen(false)
  }
  return (
    <div className="flex flex-col gap-1.5">
      {/* The button's name already starts with it */}
      {hideLabel ? null : (
        <span aria-hidden className="font-label text-sm">
          {label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={`${label}, ${dayText(value)}`}
              aria-describedby={`${id}-workdays`}
              className={cn(
                "justify-start gap-2 font-normal",
                prominent && "h-10 bg-card px-4 text-base"
              )}
            >
              <CalendarDays aria-hidden className="size-4" />
              <span className="font-label">{dayText(value)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            collisionPadding={8}
            aria-label={title}
            className="w-auto max-w-[calc(100vw-1rem)] p-0"
          >
            <div className="flex flex-wrap gap-1 border-b border-border p-2">
              {shortcuts(today, min).map((shortcut) => (
                <Button
                  key={shortcut.label}
                  type="button"
                  size="xs"
                  variant={shortcut.day === value ? "secondary" : "ghost"}
                  disabled={shortcut.disabled}
                  onClick={() => choose(shortcut.day)}
                >
                  {shortcut.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="single"
              required
              selected={dateOf(value)}
              defaultMonth={dateOf(value)}
              disabled={{ before: dateOf(min) }}
              onSelect={(date) => choose(dayOf(date))}
            />
          </PopoverContent>
        </Popover>
        <span id={`${id}-workdays`} className="text-sm text-muted-foreground">
          {workdaysText(workdaysLeft(today, value))}
        </span>
      </div>
    </div>
  )
}
