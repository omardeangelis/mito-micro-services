import React from "react"
import { DashboardAsyncLayout } from "./_components/GeneralDasboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ImportWorkerProvider } from "../_context/ImportWorker"
import { ExportWorkerProvider } from "../_context/ExportWorker"

export const dynamic = "force-dynamic"

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <UserPreferenceProvider>
      <ImportWorkerProvider>
        <ExportWorkerProvider>
          <DashboardAsyncLayout>{children}</DashboardAsyncLayout>
        </ExportWorkerProvider>
      </ImportWorkerProvider>
    </UserPreferenceProvider>
  )
}

export default Layout
