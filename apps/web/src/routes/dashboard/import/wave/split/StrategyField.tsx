import { useId } from "react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { strategies, type Strategy } from "./_lib/preview"

const order: readonly Strategy[] = ["pace", "level", "equal"]

/**
 * «Come dividere» (AC11, AC33): the three divisions one under the other, each
 * with its note always visible. Each option has its title for name and its
 * note for description; a click on the title or the note picks it
 */
export function StrategyField({
  value,
  onChange,
  disabled,
}: {
  value: Strategy
  onChange: (strategy: Strategy) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="font-label text-sm">
        Come dividere
      </span>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as Strategy)}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        className="gap-1"
      >
        {order.map((strategy) => (
          <div key={strategy} className="flex min-h-7 items-start gap-2">
            <RadioGroupItem
              id={`${id}-${strategy}`}
              value={strategy}
              aria-labelledby={`${id}-${strategy}-name`}
              aria-describedby={`${id}-${strategy}-note`}
              className="mt-0.5"
            />
            <label
              htmlFor={`${id}-${strategy}`}
              className="flex cursor-pointer flex-col text-sm"
            >
              <span id={`${id}-${strategy}-name`}>
                {strategies[strategy].label}
              </span>
              <span
                id={`${id}-${strategy}-note`}
                className="text-xs text-muted-foreground"
              >
                {strategies[strategy].note}
              </span>
            </label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}
