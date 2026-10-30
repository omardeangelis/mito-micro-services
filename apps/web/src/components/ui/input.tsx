import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.ComponentProps<"input">

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 30 px, 8 px radius; the states are those of AC11, so the focus is
        // a border and a halo (no outline) and an error always shows its halo
        "h-7.5 rounded-control hover:border-input-hover w-full min-w-0 border border-input bg-card px-2.5 text-sm outline-none transition-[color,border-color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        "focus-visible:ring-ring-soft focus-visible:border-ring focus-visible:ring-[3px]",
        "aria-invalid:border-destructive-text aria-invalid:ring-[3px] aria-invalid:ring-destructive-ring",
        className
      )}
      {...props}
    />
  )
}

export { Input }
