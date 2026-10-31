import {
  AlertTriangleIcon,
  InboxIcon,
  LockIcon,
  RotateCwIcon,
  TrendingUpIcon,
  WifiOffIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { type Action, type Status } from "../_lib/results"

/** What a chart that failed says (AC20) */
const FAILED_TEXT =
  "Non è stato possibile caricare questo grafico. Gli altri sono aggiornati."

/** What the page says offline (AC22) */
const OFFLINE_TEXT =
  "Sei offline: i grafici si aggiornano quando torna la connessione."

/** What a chart says when the session expired (AC23) */
const SESSION_TEXT = "Sessione scaduta: accedi di nuovo"

/** The id of the offline notice, which a skeleton points at (AC22) */
const OFFLINE_ID = "analisi-offline"

/** The box of the states that replace the chart; it is as tall as a small chart */
const BOX =
  "flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center"

/**
 * The page offline, once near the header (AC22). Queries pause offline and
 * resume when the connection returns, so the message is all there is to say
 */
export function OfflineNotice() {
  return (
    <p
      role="status"
      id={OFFLINE_ID}
      className="flex items-center gap-2 border-b border-border bg-muted/50 px-6 py-2 text-sm text-muted-foreground"
    >
      <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
      {OFFLINE_TEXT}
    </p>
  )
}

/**
 * The line of the number while loading: as tall as `KpiLine` (the number and
 * its caption), so the switch to ready moves nothing (AC19)
 */
function KpiSkeleton({ offline }: { offline: boolean }) {
  const pulse = cn(
    "rounded-sm motion-reduce:animate-none",
    offline ? "animate-none" : null
  )
  return (
    <div aria-hidden="true">
      <Skeleton className={cn("h-8 w-36", pulse)} />
      <Skeleton className={cn("mt-0.5 h-4 w-52", pulse)} />
    </div>
  )
}

/**
 * A chart that loads (AC19, AC26): the number line and the chart as
 * skeletons, as tall as what replaces them. `heightClass` is the height of
 * the chart area. Offline the pulse stops and the skeleton points at the
 * notice of the page (AC22)
 */
export function ChartSkeleton({
  heightClass,
  offline,
}: {
  heightClass: string
  offline: boolean
}) {
  return (
    <div
      data-testid="chart-skeleton"
      aria-busy="true"
      aria-describedby={offline ? OFFLINE_ID : undefined}
    >
      <span className="sr-only">Caricamento del grafico</span>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <KpiSkeleton offline={offline} />
      </div>
      <div className={cn("mt-4", heightClass)} aria-hidden="true">
        <Skeleton
          className={cn(
            "flex size-full items-center justify-center motion-reduce:animate-none",
            offline ? "animate-none" : null
          )}
        >
          {offline ? (
            <WifiOffIcon className="size-6 text-muted-foreground" />
          ) : null}
        </Skeleton>
      </div>
    </div>
  )
}

/**
 * A chart that didn't load, or whose drawing threw (AC20, D10): the same
 * box for both, with «Riprova». The other charts don't depend on it (AC21)
 */
export function ErrorBox({
  onRetry,
  className = "mt-6",
}: {
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        BOX,
        "border-destructive-soft-border bg-destructive-soft/40",
        className
      )}
    >
      <AlertTriangleIcon
        aria-hidden="true"
        className="text-destructive-text size-5"
      />
      <p className="max-w-xs text-sm">{FAILED_TEXT}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon aria-hidden="true" /> Riprova
      </Button>
    </div>
  )
}

/** The session expired (AC23): the app's flow says it with its toast; the panel names it */
export function SessionBox() {
  return (
    <div role="status" className={cn(BOX, "mt-6 border-border bg-muted/50")}>
      <LockIcon aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="text-sm">{SESSION_TEXT}</p>
    </div>
  )
}

/**
 * An empty chart, or one with only its number (AC19): title, reason and,
 * when there is one, the action that widens the window (AC15)
 */
export function StatusBox({
  status,
  onAction,
}: {
  status: Exclude<Status, { kind: "ready" }>
  onAction: (action: Action) => void
}) {
  const { action } = status
  return (
    <div
      className={cn(
        BOX,
        "h-full",
        status.kind === "kpiOnly"
          ? "border-border bg-muted/50"
          : "border-border"
      )}
    >
      {status.kind === "kpiOnly" ? (
        <TrendingUpIcon
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      ) : (
        <InboxIcon
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      )}
      <p className="text-sm font-medium">{status.title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{status.reason}</p>
      {action === null ? null : (
        <Button variant="outline" size="sm" onClick={() => onAction(action)}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
