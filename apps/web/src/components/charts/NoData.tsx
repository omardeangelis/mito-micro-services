/** What the charts of Tremor show without data */
export const NoData = ({ text = "Nessun dato" }: { text?: string }) => (
  <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-[#e5e7eb]">
    <p className="text-sm text-[#6b7280]">{text}</p>
  </div>
)
