import { type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"

/** La riga delle card di "Analisi Andamento": va a capo quando non ci stanno. */
export const CardRow = ({ children }: { children: ReactNode }) => (
  <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-8">
    {children}
  </div>
)

export const DataSectionSkeleton = () => (
  <CardRow>
    <Skeleton className="h-48 rounded-md" />
    <Skeleton className="h-48 rounded-md" />
    <Skeleton className="h-48 rounded-md" />
  </CardRow>
)
