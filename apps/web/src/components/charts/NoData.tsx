/** What the charts of Tremor show without data */
export const NoData = ({ text = "Nessun dato" }: { text?: string }) => (
  <div className="rounded-card flex h-full w-full items-center justify-center border border-dashed border-border">
    <p className="text-sm text-muted-foreground">{text}</p>
  </div>
)
