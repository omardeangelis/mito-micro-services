import { type UseQueryResult } from "@tanstack/react-query"
import { type ReactNode, useRef } from "react"
import { cn } from "@/lib/utils"
import { Part } from "./PartError"

/**
 * A box of the header: the label over the number of a query, which loads and
 * fails on its own. `className` holds the `min-w-[…]` that keeps its width
 * (a literal, for Tailwind)
 */
export function StatBox<A>({
  label,
  className,
  what,
  announced,
  query,
  children,
}: {
  label: string
  className: string
  what: string
  announced: string
  query: UseQueryResult<A>
  children: (data: A) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={box}
      tabIndex={-1}
      className={cn(
        "flex flex-col justify-center px-4 py-2 outline-none",
        className
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <Part
          query={query}
          what={what}
          announced={announced}
          focus={box}
          loading={<span className="text-muted-foreground">…</span>}
        >
          {children}
        </Part>
      </dd>
    </div>
  )
}
