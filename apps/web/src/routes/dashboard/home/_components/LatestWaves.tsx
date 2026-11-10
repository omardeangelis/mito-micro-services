import { type UseQueryResult } from "@tanstack/react-query"
import { Fragment, type MouseEvent, useRef, useState } from "react"
import { Link } from "react-router"
import { adminHomeKeys } from "@/api/home"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  type LatestWave,
  type LatestWaves as LatestWavesData,
} from "@mito/contract/home"
import { wavePageHref } from "../../import/_components/format"
import { PartsLegend, PartsTrack } from "../../import/wave/PartsBar"
import { formatNumber } from "../../import/wave/_lib/text"
import {
  DETAIL_BOTTOM_REM,
  DETAIL_ROW_REM,
  DETAIL_SKELETON_ROWS,
  DETAIL_TITLE_REM,
  deadlineText,
  importedText,
  meterText,
  progressText,
  summaryText,
} from "../_lib/waves"
import { useKeepInPlace } from "../_hooks/useKeepInPlace"
import { partState } from "../_lib/part"
import { toneClass } from "../_lib/tone"
import { AdminPart } from "./AdminPart"
import { DisclosureButton } from "./DisclosureButton"
import { WaveDetail } from "./WaveDetail"

/**
 * The import with its detail open: `"first"` is the latest listed, until the
 * admin clicks a row; then the run, or `null` with all closed (AC11, D16). A
 * run that is no longer listed opens nothing
 */
type OpenRun = number | "first" | null

const detailId = (wave: LatestWave) => `wave-detail-${wave.runId}`

/** The height of a row of the table and of its header, in rem (AC47) */
const ROW_REM = 2.625
const HEAD_REM = 2.25

/** The columns of AC10, in rem: the first takes what the others leave */
const columns = [
  { name: "Wave", width: "w-[17rem]" },
  { name: "Clienti", width: "w-[6rem]" },
  { name: "Senza operatore", width: "w-[8rem]" },
  { name: "Mai chiamati", width: "w-[7rem]" },
  { name: "Avanzamento", width: "w-[16rem]" },
] as const

/** The button of a row (AC13): the Wave is always a completed one */
function RowCommand({ wave }: { wave: LatestWave }) {
  const href = wavePageHref({
    id: wave.runId,
    format: "wave",
    status: "completed",
  })
  const assign = wave.parts.unassigned > 0
  return (
    <Button asChild size="sm" variant={assign ? "default" : "outline"}>
      <Link
        to={href}
        aria-label={`${assign ? "Assegna dalla" : "Apri la"} ${wave.name}`}
      >
        {assign ? "Assegna" : "Apri"}
      </Link>
    </Button>
  )
}

function WaveRow({
  wave,
  today,
  open,
  onToggle,
}: {
  wave: LatestWave
  today: string
  open: boolean
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const imported = importedText(wave, today)
  const deadline = deadlineText(wave)
  return (
    <TableRow className="group transition-none">
      <TableCell className="min-w-0 pl-5">
        {/* The whole name stays in the DOM: truncated only to the eye (AC33) */}
        <DisclosureButton
          open={open}
          controls={detailId(wave)}
          onClick={onToggle}
          className="relative -my-1 min-w-0 gap-1 rounded-sm py-1 text-sm font-medium"
        >
          <span className="min-w-0 truncate" title={wave.name}>
            {wave.name}
          </span>
        </DisclosureButton>
        <div
          title={`${imported}${deadline.text}`}
          className="truncate whitespace-nowrap text-xs text-muted-foreground"
        >
          {imported}
          <span className={toneClass[deadline.tone]}>{deadline.text}</span>
        </div>
      </TableCell>
      <TableCell>{formatNumber(wave.customers)}</TableCell>
      <TableCell
        className={cn(
          wave.parts.unassigned > 0 && "text-warning-soft-foreground"
        )}
      >
        {wave.parts.unassigned > 0
          ? formatNumber(wave.parts.unassigned)
          : "Nessuno"}
      </TableCell>
      <TableCell>{formatNumber(wave.parts.neverCalled)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <PartsTrack
            parts={wave.parts}
            role="meter"
            label={`Avanzamento della ${wave.name}`}
            valueText={meterText(wave)}
          />
          <span className="text-xs text-muted-foreground">
            {progressText(wave)}
          </span>
        </div>
      </TableCell>
      <TableCell className="group-has-aria-expanded:bg-accent sticky right-0 bg-card group-hover:bg-accent">
        <RowCommand wave={wave} />
      </TableCell>
    </TableRow>
  )
}

/** The table, in the scroller of `Table`; its border is the card's (D18) */
function WavesTable({
  data,
  openRunId,
  onToggle,
}: {
  data: LatestWavesData
  openRunId: number | null
  onToggle: (runId: number, event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    // The container of the detail's `100cqi`: outside the scroller (D18)
    <div className="@container [&>[data-slot=table-container]]:rounded-none [&>[data-slot=table-container]]:border-0">
      <Table className="min-w-[62rem] table-fixed">
        <colgroup>
          {columns.map((column) => (
            <col key={column.name} className={column.width} />
          ))}
          <col className="w-[8rem]" />
        </colgroup>
        <TableHeader>
          <TableRow className="transition-none hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.name}
                className={cn(column.name === "Wave" && "pl-5")}
              >
                {column.name}
              </TableHead>
            ))}
            <TableHead className="sticky right-0">
              <span className="sr-only">Azione</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:has(+tr[hidden]:last-child)]:border-0">
          {data.rows.map((wave) => (
            <Fragment key={wave.runId}>
              <WaveRow
                wave={wave}
                today={data.today}
                open={wave.runId === openRunId}
                onToggle={(event) => onToggle(wave.runId, event)}
              />
              {/* `aria-controls` always names an element: only its content comes and goes */}
              <TableRow
                id={detailId(wave)}
                hidden={wave.runId !== openRunId}
                className="transition-none hover:bg-transparent"
              >
                <TableCell colSpan={6} className="p-0">
                  {wave.runId === openRunId ? (
                    <div className="sticky left-0 w-[100cqi]">
                      <WaveDetail wave={wave} />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * The place of 4 rows and of the detail of the latest Wave with 15 people,
 * so the data don't move what is below them (AC47)
 */
function WavesSkeleton() {
  return (
    <div role="status" className="px-5">
      <span className="sr-only">Caricamento degli ultimi import</span>
      <div style={{ height: `${HEAD_REM}rem` }} className="flex items-center">
        <Skeleton className="h-3 w-full" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          style={{ height: `${ROW_REM}rem` }}
          className="flex items-center"
        >
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
      <Skeleton
        className="w-full"
        style={{
          height: `${DETAIL_TITLE_REM + DETAIL_SKELETON_ROWS * DETAIL_ROW_REM + DETAIL_BOTTOM_REM}rem`,
        }}
      />
    </div>
  )
}

/** «Ultimi import»; the query comes from `AdminHome` */
export function LatestWaves({
  waves,
}: {
  waves: UseQueryResult<LatestWavesData>
}) {
  const title = useRef<HTMLHeadingElement>(null)
  // Above `AdminPart`, so an error or a «Riprova» doesn't close it (D16)
  const [openRun, setOpenRun] = useState<OpenRun>("first")
  const keepInPlace = useKeepInPlace(openRun)
  // The summary and the legend are of the data, not of a skeleton or an error
  const listed =
    partState(waves) === "data" && waves.data && waves.data.rows.length > 0
      ? waves.data
      : null
  const openRunId =
    openRun === "first" ? (listed?.rows[0]?.runId ?? null) : openRun
  const toggle = (runId: number, event: MouseEvent<HTMLButtonElement>) => {
    keepInPlace(event.currentTarget)
    setOpenRun(openRunId === runId ? null : runId)
  }
  return (
    <section
      aria-labelledby="ultimi-import-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2
            id="ultimi-import-title"
            ref={title}
            tabIndex={-1}
            className="font-heading text-lg outline-none"
          >
            Ultimi import
          </h2>
          {listed ? (
            <p className="text-sm text-muted-foreground">
              {summaryText(listed)}
            </p>
          ) : null}
        </div>
        {listed ? <PartsLegend /> : null}
      </header>
      <AdminPart
        query={waves}
        retryKey={adminHomeKeys.waves()}
        what="gli ultimi import"
        focus={title}
        loading={<WavesSkeleton />}
        inset
      >
        {(data) =>
          data.rows.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              Nessun import Wave completato.
            </p>
          ) : (
            <WavesTable data={data} openRunId={openRunId} onToggle={toggle} />
          )
        }
      </AdminPart>
    </section>
  )
}
