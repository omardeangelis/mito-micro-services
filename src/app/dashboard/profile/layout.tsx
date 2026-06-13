"use client"
import React, { Suspense } from "react"
import { Tabs, TabsTrigger, TabsList } from "@/components/ui/tabs"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import {
  type ProfileTab,
  useProfileTabStore,
} from "./_store/useProfileTabStore"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { cn } from "@/lib/utils"
import { api } from "@/trpc/react"

const ProfileLayout = ({
  children,
  admin,
  blacklist,
}: {
  children: React.ReactNode
  admin: React.ReactNode
  blacklist: React.ReactNode
}) => {
  const { selectedTab, setSelectedTab } = useProfileTabStore()
  const [{ operatorId, role }] = api.user.getUserPreference.useSuspenseQuery()
  const { setOperatorId, setRole } = useUserPreferenceContext((state) => state)

  React.useEffect(() => {
    if (!operatorId || !role) return
    setOperatorId(operatorId)
    setRole(role)
  }, [operatorId, role, setOperatorId, setRole])
  return (
    <section className="dashabord-container">
      <Tabs
        defaultValue={selectedTab}
        className="mx-auto flex min-w-[676px] max-w-xl flex-col gap-4 rounded-md bg-white p-4"
        onValueChange={(value) => setSelectedTab(value as ProfileTab)}
      >
        <TabsList
          className={cn(
            "grid w-full",
            role === "ADMIN" ? "grid-cols-3" : "grid-cols-1"
          )}
        >
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {role !== "ADMIN" ? null : (
            <>
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
            </>
          )}
        </TabsList>
        <Suspense
          fallback={
            <div className="flex h-36 items-center justify-center">
              <LoadingSpinner />
            </div>
          }
        >
          {children}
          {role !== "ADMIN" ? null : (
            <>
              {admin}
              {blacklist}
            </>
          )}
        </Suspense>
      </Tabs>
    </section>
  )
}

export default ProfileLayout
