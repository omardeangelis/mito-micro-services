import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  // The focus is an outline (AC13): no `outline-none`, which would also
  // turn off the `focus-visible:outline-2` below. It shows at once: the
  // transition lists the properties that animate, never the outline
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive-text aria-invalid:outline-destructive-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        // MITO: a card-colored button with a strong border
        outline:
          "z-1 border border-border-strong bg-card text-foreground shadow-xs hover:bg-accent",
        secondary:
          "border border-border-strong bg-card text-foreground shadow-xs hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-link underline underline-offset-3",
        // MITO: a button that looks disabled and still takes the focus
        disabled: "cursor-not-allowed bg-muted text-subtle hover:bg-muted",
      },
      // Appendix C: 30 px normal, 26 small, 22 extra small, 34 large
      size: {
        default: "h-7.5 px-3 py-2 has-[>svg]:px-2.5",
        xs: "h-5.5 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6.5 gap-1.5 px-2.5 has-[>svg]:px-2",
        lg: "h-8.5 px-4 has-[>svg]:px-3.5",
        icon: "size-7.5",
        "icon-xs": "size-5.5 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-6.5",
        "icon-lg": "size-8.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
