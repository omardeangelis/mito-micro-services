import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { toggleVariants } from "@/components/ui/toggle"

// MITO: the item gives back the 6 px of the track's border and padding, so
// the group has the height of a control (appendix C)
const itemHeights = {
  default: "h-6",
  sm: "h-5",
  lg: "h-7",
} as const

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        // The track of AC15: muted, with a border
        "group/toggle-group rounded-card flex w-fit items-center gap-[--spacing(var(--gap))] border border-border bg-muted p-0.5",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)
  const itemSize = context.size ?? size ?? "default"

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      data-spacing={context.spacing}
      className={cn(
        // The track gives the look, so the variant adds nothing here
        toggleVariants({ variant: "default", size: itemSize }),
        itemHeights[itemSize],
        "w-auto min-w-0 shrink-0 px-3 focus-visible:z-10",
        // The chosen item of AC15: card, foreground, shadow-xs, border
        "data-[state=on]:shadow-xs text-muted-foreground data-[state=on]:border-border data-[state=on]:bg-card data-[state=on]:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
