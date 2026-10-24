import React from "react"
import { DashboardAsyncLayout } from "./_components/GeneralDasboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ImportWorkerProvider } from "../_context/ImportWorker"

export const dynamic = "force-dynamic"

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <UserPreferenceProvider>
      <ImportWorkerProvider>
        <DashboardAsyncLayout>{children}</DashboardAsyncLayout>
      </ImportWorkerProvider>
    </UserPreferenceProvider>
  )
}

export default Layout
