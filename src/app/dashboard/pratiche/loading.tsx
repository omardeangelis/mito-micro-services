import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import React from "react"

const PraticheLoading = () => {
  return (
    <section className="dashabord-container">
      <div className="dashbaord-layout p-4">
        <TableSkeleton rows={10} />
      </div>
    </section>
  )
}

export default PraticheLoading
