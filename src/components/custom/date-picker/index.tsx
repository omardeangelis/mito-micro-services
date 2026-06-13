"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar, type CalendarProps } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFUALTTIMEFRAME,
  type TimeFrame,
  TIMEFRAMEOPTIONS,
} from "@/lib/constants/timeframes"
import { useAnalitycsStore } from "@/store/useAnalitycsStore"
import { useRouter, useSearchParams } from "next/navigation"
import { type Matcher } from "react-day-picker"

export function DatePicker(defaultDate: Date) {
  const [date, setDate] = React.useState<Date>(defaultDate ?? new Date())

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Scegl una data</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          showOutsideDays={true}
          fixedWeeks
          defaultMonth={date}
          fromYear={1900}
          toYear={2050}
          selected={date}
          onSelect={(value) => setDate(value ?? new Date())}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

interface DatePickerFormItemProps {
  fieldValue: Date | null | undefined
  onChange: (e: unknown) => void
  label: string
  onlyFuture?: boolean
  disabled?: Matcher
}

type FormItemProps = React.ComponentProps<typeof FormItem>

export function DatePickerFormItem({
  fieldValue,
  onChange,
  label,
  onlyFuture,
  disabled,
  fromDate,
  fromYear,
  ...rest
}: DatePickerFormItemProps & FormItemProps & CalendarProps) {
  const disabledDates = React.useCallback(
    (date: Date) => {
      if (!onlyFuture) return date < new Date("1900-01-01")
      return date < new Date()
    },
    [onlyFuture]
  )
  return (
    <FormItem className="flex flex-col" {...rest}>
      <FormLabel className="mb-1">{label}</FormLabel>
      <Popover>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              variant={"outline"}
              className={cn(
                "min-w-[240px] bg-white pl-3 text-left font-normal",
                !fieldValue && "text-muted-foreground"
              )}
            >
              {fieldValue ? (
                format(fieldValue, "PPP")
              ) : (
                <span>Scegli una data</span>
              )}
              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            fixedWeeks
            showOutsideDays={true}
            defaultMonth={fieldValue ?? undefined}
            fromYear={1900}
            toYear={2050}
            selected={fieldValue ?? undefined}
            onSelect={onChange}
            disabled={disabled ?? disabledDates}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <FormMessage />
    </FormItem>
  )
}

export const TimeFrameSelector = () => {
  const searchParams = useSearchParams()
  const tf = searchParams.get("tf") as TimeFrame | null
  const { setTimeframe } = useAnalitycsStore()
  const router = useRouter()

  React.useEffect(() => {
    console.log("TimeFrameSelector mounted")
    const unsub = useAnalitycsStore.subscribe((state) => {
      const { timeframe } = state
      const url = new URL(window.location.href)
      url.searchParams.set("tf", timeframe)
      router.push(url.toString())
    })

    return () => unsub()
  }, [router])

  return (
    <Select
      defaultValue={tf ?? DEFUALTTIMEFRAME}
      onValueChange={(value: TimeFrame) => setTimeframe(value)}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Seleziona Periodo" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>TimeFrame</SelectLabel>
          {TIMEFRAMEOPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
