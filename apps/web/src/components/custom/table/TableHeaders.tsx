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
      className={cn(
        "w-full",
        isActive ? "text-blue-500" : "text-gray-500",
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
