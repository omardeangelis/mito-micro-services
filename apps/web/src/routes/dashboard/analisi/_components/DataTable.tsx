import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatCell, type Table } from "../_lib/results"

/**
 * The table under a chart (AC35, AC41): a region named «Dati del grafico»
 * that Tab reaches and that scrolls on both axes inside 480 px, so the page
 * never does (AC33). It is a plain `table` and not the `Table` of shadcn,
 * whose container would be a second border and a second scroller the sticky
 * header could not stick to. One border (the region's), a header that stays,
 * rows that don't change on hover, the columns as narrow as their text
 * allows so no table scrolls sideways from 1280 px (AC38)
 */
export function DataTable({ table }: { table: Table }) {
  return (
    <div
      role="region"
      aria-label="Dati del grafico"
      tabIndex={0}
      className="rounded-card max-h-[480px] overflow-auto border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* Separate borders: a sticky header keeps its line under it while it scrolls */}
      <table className="w-full table-auto border-separate border-spacing-0 text-sm tabular-nums">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            {table.columns.map((column) => (
              <TableHead
                key={column.header}
                className={cn(
                  // A header may wrap, even inside a word and with a hyphen where
                  // the language allows it: at 125% of text the widest table
                  // still fits 520 px (AC38). Its width is the numbers'
                  "sticky top-0 z-10 hyphens-auto whitespace-normal border-b border-border bg-card px-1.5 leading-tight [overflow-wrap:anywhere]",
                  column.format !== "text" && "text-right"
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, r) => (
            <TableRow
              key={r}
              className="border-0 hover:bg-transparent [&:not(:last-child)>td]:border-b [&>td]:border-border"
            >
              {row.map((cell, i) => {
                const format = table.columns[i]?.format ?? "text"
                return (
                  <TableCell
                    key={i}
                    className={cn(
                      "px-1.5",
                      format === "text"
                        ? "whitespace-normal"
                        : "whitespace-nowrap text-right tabular-nums"
                    )}
                  >
                    {formatCell(cell, format)}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  )
}
