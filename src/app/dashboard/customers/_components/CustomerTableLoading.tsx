import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import { Skeleton } from "@/components/ui/skeleton"
import React from "react"

export const CustomerTableLoading = () => {
  return (
    <div className="h-[inherit]">
      <div className="flex h-24 items-center gap-8 px-4">
        <Skeleton className="h-8 w-1/4 rounded-md" />
        <Skeleton className="h-8 w-1/12 rounded-md" />
      </div>
      <div className="mt-4">
        <TableSkeleton rows={10} />
      </div>
    </div>
  )
}
