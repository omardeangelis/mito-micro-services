import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { toneClasses, type Tone } from "@/lib/tones"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Skeleton } from "./skeleton"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap transition-[color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive-text [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // MITO: the variants sit on the tones of the theme (appendix B)
        default: toneClasses.neutral,
        secondary: toneClasses.neutral,
        destructive: toneClasses.red,
        outline:
          "bg-card border-border-strong text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // MITO: the states of tasks and contacts
        success: toneClasses.green,
        warning: toneClasses.amber,
      },
      // MITO: the sizes of the Next.js app, md by default
      size: {
        xs: "px-1.5 py-0.25 text-xxs",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-sm",
        lg: "px-3 py-1 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

// MITO: the size of a badge with a tone (22 px, 12 px text, weight 550)
const toneBadge = "h-5.5 rounded-full border text-xs font-label"

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** The color meaning of the badge (appendix B); it sets the size too */
    tone?: Tone
  }

function Badge({
  className,
  variant = "default",
  size,
  tone,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(
        // The size of a tone always wins: `size` is ignored with it
        badgeVariants({ variant, size: tone ? null : size }),
        tone && [toneClasses[tone], toneBadge],
        className
      )}
      {...props}
    />
  )
}

/** MITO: the placeholder of a badge while its data loads */
function SkeletonBadge({
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return (
    <Skeleton
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants, SkeletonBadge }
