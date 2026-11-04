import { CalendarDays, ChevronRight } from "lucide-react"
import { type ReactNode, type Ref } from "react"
import { Link } from "react-router"
import { type WaveView } from "@/api/import"
import { Skeleton } from "@/components/ui/skeleton"
import { workdaysLeft } from "@mito/domain/wave/days"
import {
  customersText,
  dayText,
  formatNumber,
  importedWhen,
  workdaysText,
} from "./_lib/text"

/** Da fare della Wave: the active contacts in Da chiamare or Non risponde of the team */
export const waveTodo = (wave: Pick<WaveView, "team">) =>
  wave.team.reduce(
    (sum, member) => sum + member.waveTodo.toCall + member.waveTodo.noAnswer,
    0
  )

/**
 * The header of the page (AC18, AC33): the path «Import › <file>», the name
 * of the Wave, when it was imported and its customers. On the right, out of
 * the flow «Dopo l'import», the state of the deadline with «Proroga»
 * (`extend`, for a Wave with a deadline). The name takes the focus when the
 * page opens on the overview (AC31)
 */
export function WaveHeader({
  wave,
  fromImport,
  showDeadline,
  extend,
  nameRef,
}: {
  wave: WaveView
  /** Opened from the toast at the end of the import (`?da=import`) */
  fromImport: boolean
  showDeadline: boolean
  /** «Proroga», beside a deadline that exists */
  extend?: ReactNode
  nameRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      <nav
        aria-label="Percorso"
        className="min-w-0 text-sm text-muted-foreground"
      >
        <ol className="flex min-w-0 items-center gap-1">
          <li className="shrink-0">
            <Link
              to="/dashboard/import"
              className="inline-flex min-h-6 items-center hover:text-foreground hover:underline"
            >
              Import
            </Link>
          </li>
          <li aria-hidden className="shrink-0">
            <ChevronRight className="size-3.5" />
          </li>
          <li
            aria-current="page"
            title={wave.fileName}
            className="min-w-0 truncate text-foreground"
          >
            {wave.fileName}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            ref={nameRef}
            tabIndex={-1}
            className="font-heading text-title break-words outline-none"
          >
            {wave.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Importata {importedWhen(wave.importedAt, wave.today)} ·{" "}
            {customersText(wave.customers)}
            {fromImport ? " · import completato" : ""}
          </p>
        </div>
        {showDeadline ? (
          <div className="flex flex-wrap items-center gap-3">
            <DeadlineStatus wave={wave} />
            {wave.deadline === null ? null : extend}
          </div>
        ) : null}
      </div>
    </header>
  )
}

/** The deadline as it stands: open, expired, or to confirm (AC9, AC18) */
function DeadlineStatus({ wave }: { wave: WaveView }) {
  if (wave.deadline === null) {
    return (
      <p className="font-label text-tag-amber-text text-sm">
        Scadenza da confermare
      </p>
    )
  }
  if (wave.status === "expired") {
    return (
      <p className="font-label text-destructive-text flex items-center gap-1.5 text-sm">
        <CalendarDays aria-hidden className="size-4" />
        Scaduta {dayText(wave.deadline)} · {formatNumber(waveTodo(wave))} da
        fare
      </p>
    )
  }
  const workdays = wave.workdaysLeft ?? workdaysLeft(wave.today, wave.deadline)
  return (
    <p className="flex items-center gap-1.5 text-sm">
      <CalendarDays aria-hidden className="size-4" />
      Scadenza {dayText(wave.deadline)} · {workdaysText(workdays)}
    </p>
  )
}

/** The header while the Wave loads (AC38) */
export function WaveHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-60" />
    </div>
  )
}
