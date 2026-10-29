import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Column } from "@tanstack/react-table"
import { ArrowDown, ArrowUp } from "lucide-react"
import { type PropsWithChildren } from "react"

interface SortableHeaderProps<T> {
  column: Column<T, unknown>
}

type ButtonProps = React.ComponentProps<typeof Button>

export function SortableHeader<T>({
  column,
  className,
  children,
  ...rest
}: PropsWithChildren<SortableHeaderProps<T> & ButtonProps>) {
  const isActive = column.getIsSorted()
  const isDesc = column.getIsSorted() === "desc"
  return (
    <Button
      variant="ghost"
      // 26 px: with the 2 px outline at 2 px of AC13 it stays inside the
      // 36 px header, whose table clips what overflows
      size="sm"
      className={cn(
        // The header's 12 px and weight 550 (AC14); the sorted column is in
        // foreground, the others in muted-foreground
        "font-label w-full text-xs",
        isActive ? "text-foreground" : "text-muted-foreground",
        className
      )}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      {...rest}
    >
      {children}
      {isActive ? (
        isDesc ? (
          <ArrowDown className="h-4 w-4" />
        ) : (
          <ArrowUp className="h-4 w-4" />
        )
      ) : null}
    </Button>
  )
}
