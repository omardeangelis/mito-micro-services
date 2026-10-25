import React from "react"
import { DashboardAsyncLayout } from "./_components/GeneralDasboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ImportStatusProvider } from "../_context/ImportStatus"

export const dynamic = "force-dynamic"

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <UserPreferenceProvider>
      <ImportStatusProvider>
        <DashboardAsyncLayout>{children}</DashboardAsyncLayout>
      </ImportStatusProvider>
    </UserPreferenceProvider>
  )
}

export default Layout
