import React from "react"
import { DashboardLayout } from "../../_components/DashboardLayout"

export const DashboardAsyncLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <main className="relative flex flex-row">
      <DashboardLayout />
      {children}
    </main>
  )
}
