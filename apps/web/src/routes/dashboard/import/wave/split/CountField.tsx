import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatNumber } from "../_lib/text"
import { countError } from "./_lib/preview"

/**
 * «Quanti» (AC13): the number, «su <max>» and, when the number isn't the
 * maximum, «Tutti», which brings it back to the maximum. A number out of
 * range shows «Scrivi un numero da 1 a <max>» in red under the field, and the
 * field has that text as its description
 */
export function CountField({
  text,
  max,
  atMax,
  showError,
  onChange,
  onAll,
  disabled,
}: {
  /** What the field shows */
  text: string
  max: number
  /** The number is the maximum: no «Tutti» */
  atMax: boolean
  showError: boolean
  onChange: (text: string) => void
  onAll: () => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="font-label text-sm">
          Quanti
        </label>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          className="w-28 tabular-nums"
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
        />
        <span className="text-sm text-muted-foreground">
          su {formatNumber(max)}
        </span>
        {atMax ? null : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onAll}
          >
            Tutti
          </Button>
        )}
      </div>
      {showError ? (
        <p id={`${id}-error`} className="text-destructive-text text-sm">
          {countError(max)}
        </p>
      ) : null}
    </div>
  )
}
