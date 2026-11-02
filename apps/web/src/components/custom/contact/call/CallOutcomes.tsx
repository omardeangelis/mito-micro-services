import * as React from "react"
import { addDays, format, startOfDay } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarClock } from "lucide-react"
import { callOutcomes, type CallOutcome } from "@mito/domain/contact/outcome"
import { stateLabel } from "@mito/domain/contact/status"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** What the user chose: the outcome, and for Richiamare its day and message. */
export type OnOutcome = (
  outcome: CallOutcome,
  callbackOn: Date | undefined,
  message: string | undefined
) => void

/** The longest message of a callback (AC47 of home-operatore) */
const MESSAGE_MAX = 500

/** «gg/mm» of a `YYYY-MM-DD` day. */
const dayMonth = (day: string) => {
  const [, month = "", date = ""] = day.split("-")
  return `${date}/${month}`
}

/**
 * The four outcomes of «Registra chiamata»: in a row when the nearest
 * `@container` is at least 63rem wide, 2×2 below. «Richiamare» opens the panel
 * with the calendar and the message. The parent owns what an outcome does,
 * including a confirmation before closing a future alert: it decides in
 * `onOutcome`.
 */
export function CallOutcomes({
  customer,
  now,
  onOutcome,
  pending = null,
  replacesAlertDay,
  error,
}: {
  customer: string
  now: Date
  onOutcome: OnOutcome
  /** The outcome being registered: «Registro…» on its button, all disabled */
  pending?: CallOutcome | null | undefined
  /** The day (`YYYY-MM-DD`) of the open alert Richiamare would replace */
  replacesAlertDay?: string | null | undefined
  /** Shown under the calendar; opens the panel */
  error?: string | null | undefined
}) {
  const busy = pending !== null
  // The button says the state the outcome leads to, except Richiamare (the
  // state is «Richiamo»)
  const labelOf = (outcome: CallOutcome) =>
    pending === outcome ? "Registro…" : stateLabel(outcome)
  return (
    <div
      className="@min-[63rem]:flex @min-[63rem]:items-center grid grid-cols-2 gap-1.5"
      role="group"
      aria-label={`Esito della chiamata a ${customer}`}
    >
      {callOutcomes.map((outcome) =>
        outcome === "richiamare" ? (
          <CallbackPanel
            key={outcome}
            customer={customer}
            now={now}
            pending={pending === outcome}
            disabled={busy}
            replacesAlertDay={replacesAlertDay}
            error={error}
            onSave={(day, message) => onOutcome(outcome, day, message)}
          />
        ) : (
          <Button
            key={outcome}
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onOutcome(outcome, undefined, undefined)}
          >
            {labelOf(outcome)}
          </Button>
        )
      )}
    </div>
  )
}

/**
 * The panel of «Richiamare»: the calendar, the message and the save. By
 * default it is a «Richiamare» button with its popover. With `children` it
 * is anchored to them and opened from outside (`open`, `onOpenChange`): the
 * state cell of the list opens it from its menu.
 */
export function CallbackPanel({
  customer,
  now,
  pending,
  disabled,
  replacesAlertDay,
  error,
  onSave,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  customer: string
  now: Date
  pending: boolean
  disabled: boolean
  replacesAlertDay: string | null | undefined
  error: string | null | undefined
  onSave: (day: Date, message: string | undefined) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Anchors the panel to them, in place of the «Richiamare» button */
  children?: React.ReactNode
}) {
  const [ownOpen, setOwnOpen] = React.useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen

  // The draft outlives a close (a click outside, Esc): it is lost only when
  // the component unmounts, or saved, which closes the panel
  const [day, setDay] = React.useState<Date | undefined>()
  const [message, setMessage] = React.useState("")
  // After a successful save the parent moves the focus, not the popover
  const saved = React.useRef(false)
  // A save of this panel is waiting for its answer
  const saving = React.useRef(false)
  const tomorrow = addDays(startOfDay(now), 1)
  const titleId = React.useId()
  const contentRef = React.useRef<HTMLDivElement>(null)
  // The panel stays open while it saves (AC20 of home-operatore). With the
  // answer it closes, and the draft is no longer needed; a rejection or an
  // uncertain outcome (`error`) keeps it open with the draft
  React.useEffect(() => {
    if (pending) {
      saving.current = true
      return
    }
    if (!saving.current) return
    saving.current = false
    if (error) return
    saved.current = true
    setOpen(false)
    setDay(undefined)
    setMessage("")
  }, [pending, error, setOpen])
  // A failed save brings the panel back, with the draft
  React.useEffect(() => {
    if (error) setOpen(true)
  }, [error, setOpen])
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Esc, a click outside and the focus going out don't close it while
        // it saves (AC20)
        if (!next && pending) return
        setOpen(next)
      }}
    >
      {children ? (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" disabled={disabled}>
            <CalendarClock aria-hidden />
            Richiamare
          </Button>
        </PopoverTrigger>
      )}
      {/* To the left of the button: Radix then slides it up or down to stay
          in the window, so "Salva" is never below the bottom edge */}
      <PopoverContent
        side="left"
        align="center"
        collisionPadding={8}
        // With reduced motion it appears and goes at once: no fade, zoom or
        // slide of the popover
        className="w-auto p-3 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
        ref={contentRef}
        // A dialog named by its title (AC46 of home-operatore)
        aria-labelledby={titleId}
        // The focus goes to the day of the draft, or to tomorrow (AC46)
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const target = (day ?? tomorrow).toLocaleDateString()
          contentRef.current
            ?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)
            ?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (saved.current) event.preventDefault()
          saved.current = false
        }}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!day || pending) return
            onSave(day, message.trim() === "" ? undefined : message.trim())
          }}
        >
          <div>
            <p id={titleId} className="font-label text-sm">
              Richiamare {customer}
            </p>
            <p className="text-xs text-muted-foreground">
              Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non
              risponde.
            </p>
            {replacesAlertDay ? (
              <p className="text-xs text-muted-foreground">
                Sostituisce il richiamo del {dayMonth(replacesAlertDay)}
              </p>
            ) : null}
          </div>
          <Calendar
            mode="single"
            locale={it}
            weekStartsOn={1}
            fixedWeeks
            // On the month of the draft's day, if any (AC21 of home-operatore)
            defaultMonth={day ?? tomorrow}
            selected={day}
            onSelect={setDay}
            disabled={{ before: tomorrow }}
            className="p-0"
          />
          {error ? (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <Input
              placeholder="Messaggio (facoltativo)"
              aria-label="Messaggio"
              maxLength={MESSAGE_MAX}
              value={message}
              onChange={(event) =>
                setMessage(event.target.value.slice(0, MESSAGE_MAX))
              }
            />
            {message.length >= MESSAGE_MAX ? (
              <p className="text-xs text-muted-foreground">
                Massimo 500 caratteri
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={!day || pending}>
            {pending
              ? "Registro…"
              : day
                ? `Salva richiamo del ${format(day, "dd/MM")}`
                : "Scegli il giorno"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
