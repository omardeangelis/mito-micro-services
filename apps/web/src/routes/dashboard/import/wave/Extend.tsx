import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { addDays, extendStart, type Day } from "@mito/domain/wave/days"
import { importKeys, useSetDeadline, type WaveView } from "@/api/import"
import { isApiFailure } from "@/api/errors"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DeadlineField } from "./DeadlineField"
import { deadlineRefusal } from "./_lib/errors"
import { dayText, formatNumber, shortDay } from "./_lib/text"
import { waveTodo } from "./WaveHeader"

/** The first day «Proroga» can choose: after the deadline and after today (AC20) */
export const extendMin = (today: Day, deadline: Day): Day => {
  const afterDeadline = addDays(deadline, 1)
  const afterToday = addDays(today, 1)
  return afterDeadline > afterToday ? afterDeadline : afterToday
}

/** What a failed save says (AC16 for the deadline, AC20) */
function failureText(error: unknown): { text: string; uncertain: boolean } {
  const refusal = deadlineRefusal(error)
  if (refusal !== null) return { text: refusal, uncertain: false }
  if (isApiFailure(error) && error._tag === "ApiUnavailable") {
    return {
      text: "Non sappiamo se la proroga è stata salvata. La scadenza qui sopra è riletta.",
      uncertain: true,
    }
  }
  return {
    text: "Non è stato possibile prorogare. Riprova.",
    uncertain: false,
  }
}

/**
 * «Proroga» (AC20): the button, which opens a popover named «Proroga» with
 * «Nuova scadenza» and the button «Proroga al <g/m>», which saves at once. The
 * header, the banner of the expired Wave and the screens at the end of a flow
 * place it (`<Extend id={id} wave={wave} />`); it draws nothing for a Wave without a
 * deadline.
 *
 * It saves with `kind: "extend"`; on success it closes and says the toast with
 * the deadline the page had before the confirmation, also when the server
 * answers a repeat. A failure keeps it open with the chosen day and one
 * message; an uncertain outcome reads the Wave again.
 */
export function Extend({
  id,
  wave,
  variant = "secondary",
  size = "sm",
  align = "end",
}: {
  /** The id of the Wave (the path's) */
  id: number
  wave: WaveView
  variant?: "default" | "secondary" | "outline"
  size?: "default" | "sm" | "lg"
  align?: "start" | "center" | "end"
}) {
  const deadline = wave.deadline
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<Day | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  // The deadline and the name when «Proroga al» was pressed: what the toast says
  const asked = useRef<{ before: Day; name: string; day: Day } | null>(null)
  // Set while the last attempt ended uncertain: a retry of the same day keeps
  // the deadline of the first attempt, the re-read may already show the new one
  const uncertainOn = useRef<Day | null>(null)
  const save = useSetDeadline(id, {
    onSuccess: (result) => {
      const before = asked.current
      uncertainOn.current = null
      setOpen(false)
      setMessage(null)
      // A repeat (before = after) says the deadline the page asked from; a
      // real write says the one the server replaced
      const replaced =
        result.before !== null && result.before !== result.after
          ? result.before
          : (before?.before ?? result.after)
      toast.success(
        `Scadenza della ${before?.name ?? wave.name} spostata al ${dayText(result.after)}`,
        { description: `Prima era ${dayText(replaced)}.` }
      )
    },
    onError: (error) => {
      const { text, uncertain } = failureText(error)
      setMessage(text)
      uncertainOn.current = uncertain ? (asked.current?.day ?? null) : null
      if (uncertain) {
        void queryClient.invalidateQueries({ queryKey: importKeys.wave(id) })
      }
    },
  })
  if (deadline === null) return null
  const chosen = value ?? extendStart(wave.today, deadline)
  const todo = waveTodo(wave)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          uncertainOn.current = null
          setValue(extendStart(wave.today, deadline))
          setMessage(null)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size={size} variant={variant}>
          Proroga
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label="Proroga"
        collisionPadding={8}
        className="flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-3"
      >
        <p className="font-label text-sm">Proroga la {wave.name}</p>
        <DeadlineField
          value={chosen}
          onChange={setValue}
          today={wave.today}
          min={extendMin(wave.today, deadline)}
          label="Nuova scadenza"
          title="Scegli la nuova scadenza"
          disabled={save.isPending}
        />
        <p className="text-xs text-muted-foreground">
          {todo === 1
            ? "1 contatto ancora da fare resta a chi lo ha."
            : `${formatNumber(todo)} contatti ancora da fare restano a chi li ha.`}
        </p>
        {message === null ? null : (
          <p role="alert" className="text-destructive-text text-sm">
            {message}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          disabled={save.isPending}
          onClick={() => {
            const retry =
              uncertainOn.current === chosen && asked.current?.day === chosen
            asked.current = {
              before: retry ? asked.current!.before : deadline,
              name: wave.name,
              day: chosen,
            }
            setMessage(null)
            save.mutate({ deadline: chosen, kind: "extend" })
          }}
        >
          Proroga al {shortDay(chosen)}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
