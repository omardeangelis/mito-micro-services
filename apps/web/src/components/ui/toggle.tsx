import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  // The focus is an outline (AC13): no `outline-none`, which would also turn
  // off the `focus-visible:outline-2` below
  "inline-flex items-center justify-center gap-2 rounded-control border border-transparent text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,box-shadow] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive-text aria-invalid:outline-destructive-text data-[state=on]:border-border data-[state=on]:bg-accent data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        // MITO: as the outline button
        outline:
          "border-border-strong bg-card text-foreground shadow-xs hover:bg-accent",
      },
      // MITO: the heights of the controls (appendix C), not the 36 of shadcn
      size: {
        default: "h-7.5 min-w-7.5 px-2",
        sm: "h-6.5 min-w-6.5 px-1.5",
        lg: "h-8.5 min-w-8.5 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
