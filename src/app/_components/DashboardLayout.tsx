"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import Image from "next/image"
import {
  FolderIcon,
  HomeIcon,
  UserIcon,
  ChevronLeft,
  ChevronRight,
  InfoIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useHandleImportWorkerStates } from "../_context/ImportWorker"
import { useHandleExportWorkerStates } from "../_context/ExportWorker"

const uncollapsedClassWidth = "w-72"
const collapsedClassWidth = "w-16"
const transitionClass = "transition-all duration-300"

export function DashboardLayout() {
  useHandleImportWorkerStates()
  useHandleExportWorkerStates()
  const pathname = usePathname()
  const preference = useUserPreferenceContext((state) => state.preferences)
  const updatedCollapsed = useUserPreferenceContext(
    (state) => state.setDashboardCollapsed
  )

  const updateFn = useCallback(
    (collpsed: boolean) => {
      fetch("/api/user/preferences?pref=ds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences: {
            dashboardCollapsed: collpsed,
          },
        }),
      })
        .then((_) => {
          updatedCollapsed(collpsed)
        })
        .catch(console.error)
    },
    [updatedCollapsed]
  )
  const toggleCollapse = useCallback(async () => {
    try {
      updateFn(!preference?.dashboardCollapsed)
    } catch (error) {
      console.error(error)
    }
  }, [preference?.dashboardCollapsed, updateFn])

  const isDashboard = pathname === "/dashboard/" || pathname === "/dashboard"
  const isCustomers = pathname.includes("dashboard/customers")
  const isPratiche = pathname.includes("dashboard/pratiche")
  const isProfile = pathname.includes("dashboard/profile")
  const defaultListItemClass = useMemo(
    () =>
      cn(
        "flex place-items-center rounded-2xl",
        preference?.dashboardCollapsed ? "p-2 w-fit" : "p-6"
      ),
    [preference?.dashboardCollapsed]
  )

  const iconClass = useMemo(
    () =>
      cn(
        "text-inherit",
        "font-bold",
        preference?.dashboardCollapsed ? "mr-0" : "mr-2 text-2xl"
      ),
    [preference?.dashboardCollapsed]
  )

  return (
    <>
      <nav
        className={cn(
          "fixed bottom-0 left-0 top-0 bg-gray-100",
          preference?.dashboardCollapsed
            ? collapsedClassWidth
            : uncollapsedClassWidth,
          transitionClass
        )}
      >
        <ul
          className={cn(
            "flex flex-col",
            preference?.dashboardCollapsed
              ? "items-center gap-8 px-2 pt-4"
              : "gap-4 px-4 pt-4"
          )}
        >
          <Link href="/dashboard/">
            <li className="flex place-items-center gap-2">
              <Image
                src="/deutsche.png"
                alt="business-logo"
                width={24}
                height={24}
              />
              {preference?.dashboardCollapsed ? null : (
                <span className="whitespace-nowrap text-xl font-bold text-neutral-700">
                  Mito SRL
                </span>
              )}
            </li>
          </Link>
          <Link
            href="/dashboard/"
            className={
              isDashboard
                ? cn(defaultListItemClass, "mt-12 bg-slate-800 text-white")
                : cn(defaultListItemClass, "mt-12 hover:bg-gray-300")
            }
          >
            <li className="flex place-items-center rounded-2xl text-inherit">
              <HomeIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-bold text-inherit">Home</span>
              )}
            </li>
          </Link>
          <Link
            href="/dashboard/customers"
            className={
              isCustomers
                ? cn(defaultListItemClass, "bg-slate-800 text-white")
                : cn(defaultListItemClass, "hover:bg-gray-300")
            }
          >
            <li className="flex place-items-center rounded-2xl text-inherit">
              <UserIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-bold text-inherit">Customers</span>
              )}
            </li>
          </Link>
          <Link
            href="/dashboard/pratiche"
            className={
              isPratiche
                ? cn(defaultListItemClass, "bg-slate-800 text-white")
                : cn(defaultListItemClass, "hover:bg-gray-300")
            }
          >
            <li className="flex place-items-center rounded-2xl text-inherit">
              <FolderIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-bold text-inherit">Pratiche</span>
              )}
            </li>
          </Link>
        </ul>
        <div
          className={cn(
            "fixed bottom-0 left-0",
            preference?.dashboardCollapsed ? "w-16 p-2" : "w-72 p-4"
          )}
        >
          <Link
            href="/dashboard/profile"
            className={
              isProfile
                ? cn(defaultListItemClass, "mb-4 bg-slate-800 text-white")
                : cn(defaultListItemClass, "mb-4 hover:bg-gray-300")
            }
          >
            <div className="flex place-items-center rounded-2xl text-inherit">
              <InfoIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-bold text-inherit">Profile</span>
              )}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className={"hover:bg-gray-300"}
          >
            {preference?.dashboardCollapsed ? (
              <ChevronRight />
            ) : (
              <ChevronLeft />
            )}
          </Button>
        </div>
      </nav>
      <aside
        className={cn(
          preference?.dashboardCollapsed ? "min-w-16" : "min-w-72",
          transitionClass
        )}
      />
    </>
  )
}
