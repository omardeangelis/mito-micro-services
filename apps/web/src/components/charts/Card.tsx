import { type ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** The card of Tremor 3, with its classes: the cards of the dashboard */
export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "relative w-full rounded-lg bg-white p-6 text-left shadow-[0_1px_3px_0_rgb(0_0_0/0.1),0_1px_2px_-1px_rgb(0_0_0/0.1)] ring-1 ring-[#e5e7eb]",
      className
    )}
    {...props}
  />
)
