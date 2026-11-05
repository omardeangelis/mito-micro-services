import { type UseQueryResult } from "@tanstack/react-query"
import { RotateCw } from "lucide-react"
import { type ReactNode, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useRetry } from "../_hooks/useLavoroAnnounce"

/**
 * The error of a part of the home, «Non è stato possibile caricare <what>.»
 * with «Riprova», announced: in place of the content when the first load
 * failed; a line over the content, with `above`, when an update did
 */
export function PartError({
  what,
  onRetry,
  above = false,
  inset = false,
}: {
  what: string
  onRetry: () => void
  above?: boolean
  inset?: boolean
}) {
  const alert = (
    <div
      role="alert"
      className={cn(
        "text-destructive-soft-foreground flex gap-2 text-sm",
        !inset &&
          "rounded-control border-destructive-soft-border bg-destructive-soft border",
        above
          ? cn(
              "flex-wrap items-center justify-between",
              !inset && "mb-2 px-3 py-1.5"
            )
          : cn("flex-col items-start", !inset && "px-3 py-3")
      )}
    >
      <span>Non è stato possibile caricare {what}.</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        <RotateCw aria-hidden />
        Riprova
      </Button>
    </div>
  )
  // Inside a section that has its own border: the margin of the skeleton, the
  // text on the line of the title, no second border (AC51)
  return inset ? (
    <div className={above ? "px-5 pt-3" : "px-5 py-3"}>{alert}</div>
  ) : (
    alert
  )
}

/**
 * A part of the home on its query, which loads and fails on its own. The first
 * load and «Riprova» show `loading` when there is no content, and an update
 * keeps what is on screen, the content or the error with its «Riprova» (AC37).
 * A read of a query with no data puts it back to pending, without its error, so
 * `errorUpdatedAt` is what says it failed. `what` is what the error says
 * didn't load. «Riprova» moves the focus
 * to `focus` and, once the data are back, announces `announced` (AC50). With
 * `data` the part shows that instead of `query.data` (`undefined` is no data),
 * for a part that keeps its own copy of what the query read
 */
export function Part<A, D = A>({
  query,
  what,
  announced,
  focus,
  loading,
  inset = false,
  children,
  ...own
}: {
  query: UseQueryResult<A>
  what: string
  announced: string
  focus: RefObject<HTMLElement | null>
  loading: ReactNode
  inset?: boolean
  data?: D | undefined
  children: (data: D) => ReactNode
}) {
  const data = ("data" in own ? own.data : query.data) as D | undefined
  const { retry, retrying } = useRetry(query, announced, focus)
  const failed =
    !retrying &&
    (query.isError || (query.isPending && query.errorUpdatedAt > 0))
  if (data === undefined)
    return failed ? (
      <PartError what={what} onRetry={retry} inset={inset} />
    ) : (
      loading
    )
  return (
    <>
      {failed ? (
        <PartError what={what} onRetry={retry} above inset={inset} />
      ) : null}
      {children(data)}
    </>
  )
}
