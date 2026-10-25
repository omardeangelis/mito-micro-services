import { type Preview } from "@/lib/import/session"
import { count, formatLabels } from "./format"

/** The numbers of the preview (AC7): nothing is written yet. */
export function ImportPreview({
  fileName,
  preview,
}: {
  fileName: string
  preview: Preview
}) {
  const { counts } = preview
  const rows: [string, number][] = [
    ["Righe del file", counts.rows],
    ["Righe importabili", counts.importable],
    ["Righe solo cliente", counts.customerOnly],
    ["Righe scartate", counts.discarded],
    ["Clienti nuovi", counts.customersNew],
    ["Clienti da aggiornare", counts.customersToUpdate],
    ["Pratiche nuove", counts.practicesNew],
    ["Pratiche da aggiornare", counts.practicesToUpdate],
    ["Legami nuovi", counts.linksNew],
  ]
  return (
    <div>
      <p>
        <span className="font-bold">{fileName}</span>, formato{" "}
        {formatLabels[preview.format]}
      </p>
      <dl className="mt-4 grid max-w-xl grid-cols-[1fr_auto] gap-x-8 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="text-right font-bold tabular-nums">
              {count(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
