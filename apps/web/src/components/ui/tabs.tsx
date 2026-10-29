import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // MITO: a 30 px track like the controls (appendix C), radius 10 px
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-[orientation=horizontal]/tabs:h-7.5 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        // The track of AC15: muted, with a border
        default: "rounded-card border border-border bg-muted p-0.5",
        line: "gap-1 rounded-none bg-transparent p-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // The focus is an outline (AC13): no `outline-none`, which would also
        // turn off the `focus-visible:outline-2`; z-10 keeps it above the
        // next tab, which is `relative` too
        "rounded-control relative inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap border border-transparent px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,border-color,box-shadow] hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-data-[orientation=vertical]/tabs:py-1 group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        // The chosen tab of AC15: card, foreground, shadow-xs, border
        "data-[state=active]:shadow-xs data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
