import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Preview } from "./_lib/preview"

/**
 * The message of a confirmation that didn't succeed (AC16), in place of the
 * summary, with «Riprova» when a re-read failed
 */
export type SplitNotice = {
  readonly text: string
  readonly retry?: () => void
}

/**
 * The summary of the split (AC14): the shares and what each has after, or the
 * first message that applies, grey or red. A message of AC16 (`notice`) takes
 * its place, in red: one message at a time. A polite live region: its text
 * changes once per change, so it is read once per change
 */
export function SplitSummary({
  preview,
  notice = null,
}: {
  preview: Preview
  notice?: SplitNotice | null
}) {
  const error = notice !== null || (!preview.ok && preview.tone === "error")
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p
        aria-live="polite"
        className={cn(
          "text-sm",
          error ? "text-destructive-text" : "text-muted-foreground"
        )}
      >
        {notice?.text ?? preview.summary}
      </p>
      {notice?.retry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={notice.retry}
        >
          Riprova
        </Button>
      ) : null}
    </div>
  )
}
