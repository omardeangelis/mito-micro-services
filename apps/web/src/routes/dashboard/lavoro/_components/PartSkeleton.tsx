import { Skeleton } from "@/components/ui/skeleton"

/** The rows of a section while it loads, announced with `label` */
export function PartSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" className="px-5 py-3">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-3 py-1">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
