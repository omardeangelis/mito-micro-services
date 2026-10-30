import { type ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** The card of Tremor 3, on the tokens: the cards of the dashboard */
export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "rounded-card relative w-full border border-border bg-card p-6 text-left shadow-card",
      className
    )}
    {...props}
  />
)
