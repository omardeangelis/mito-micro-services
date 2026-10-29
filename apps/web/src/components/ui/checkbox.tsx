import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "rounded-check border-control aria-invalid:border-destructive-text peer size-4 shrink-0 border-[1.5px] bg-card transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      {/* The check when checked, a dash when indeterminate (the select-all of
          a partial selection), both inside the 13 px of the box */}
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3 group-data-[state=indeterminate]:hidden" />
        <MinusIcon className="hidden size-3 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
