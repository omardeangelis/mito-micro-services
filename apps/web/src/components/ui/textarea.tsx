import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.ComponentProps<"textarea">

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // The states of AC11, as the input's
        "field-sizing-content rounded-control hover:border-input-hover focus-visible:ring-ring-soft aria-invalid:border-destructive-text aria-invalid:ring-[3px] aria-invalid:ring-destructive-ring flex min-h-16 w-full border border-input bg-card px-2.5 py-2 text-sm outline-none transition-[color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
