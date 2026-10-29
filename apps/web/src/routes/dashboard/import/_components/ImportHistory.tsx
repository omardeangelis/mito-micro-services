import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HISTORY_PAGE_SIZE } from "@mito/domain/import/payload"
import { useImportList } from "@/api/import"
import { importTone } from "@/lib/tones"
import {
  count,
  duration,
  formatLabels,
  startedAt,
  statusLabels,
} from "./format"

/** The imports from the latest, 20 a page (AC28–AC30). */
export function ImportHistory() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError } = useImportList(page)

  if (isPending) return <p className="text-muted-foreground">Caricamento…</p>
  if (isError || !data) {
    return (
      <p role="alert" className="text-destructive-text">
        Lo storico degli import non si carica: riprova tra poco
      </p>
    )
  }
  if (data.total === 0) {
    return <p className="text-muted-foreground">Nessun import</p>
  }
  const pages = Math.ceil(data.total / HISTORY_PAGE_SIZE)
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Inizio</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Formato</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Durata</TableHead>
            <TableHead className="text-right">Clienti nuovi</TableHead>
            <TableHead className="text-right">Clienti aggiornati</TableHead>
            <TableHead className="text-right">Pratiche nuove</TableHead>
            <TableHead className="text-right">Pratiche aggiornate</TableHead>
            <TableHead className="text-right">Legami nuovi</TableHead>
            <TableHead className="text-right">Righe scartate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.imports.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="whitespace-nowrap">
                {startedAt(run.startedAt)}
              </TableCell>
              <TableCell>{run.startedBy}</TableCell>
              <TableCell className="max-w-48 truncate" title={run.fileName}>
                {run.fileName}
              </TableCell>
              <TableCell>{formatLabels[run.format]}</TableCell>
              <TableCell>
                <Badge tone={importTone(run.status)}>
                  {statusLabels[run.status]}
                </Badge>
                {run.failureReason ? (
                  <p className="mt-1 max-w-64 text-sm text-muted-foreground">
                    {run.failureReason}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {duration(run.durationMs)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.customersCreated)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.customersUpdated)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.practicesCreated)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.practicesUpdated)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.linksCreated)}
              </TableCell>
              <TableCell className="text-right">
                {count(run.rowsDiscarded)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 ? (
        <nav
          aria-label="Pagine dello storico"
          className="mt-4 flex items-center justify-end gap-4"
        >
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Precedente
          </Button>
          <span aria-live="polite">
            Pagina {page} di {pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Successiva
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
