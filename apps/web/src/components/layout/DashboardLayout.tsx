import { Link } from "react-router"
import { cn } from "@/lib/utils"
import {
  FolderIcon,
  HomeIcon,
  PhoneCall,
  UserIcon,
  ChevronLeft,
  ChevronRight,
  InfoIcon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { usePathname } from "@/lib/navigation"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

const uncollapsedClassWidth = "w-72"
const collapsedClassWidth = "w-16"
const transitionClass = "transition-all duration-300"

export function DashboardLayout() {
  const pathname = usePathname()
  const preference = useUserPreferenceContext((state) => state.preferences)
  const isAdmin = useUserPreferenceContext((state) => state.role) === "ADMIN"
  const updatedCollapsed = useUserPreferenceContext(
    (state) => state.setDashboardCollapsed
  )

  const toggleCollapse = useCallback(() => {
    updatedCollapsed(!preference?.dashboardCollapsed)
  }, [preference?.dashboardCollapsed, updatedCollapsed])

  const isDashboard = pathname === "/dashboard/" || pathname === "/dashboard"
  const isCustomers = pathname.includes("dashboard/customers")
  const isContatti = pathname.includes("dashboard/contatti")
  const isPratiche = pathname.includes("dashboard/pratiche")
  const isProfile = pathname.includes("dashboard/profile")
  const isImport = pathname.includes("dashboard/import")
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
          <Link to="/dashboard/">
            <li className="flex place-items-center gap-2">
              <img
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
            to="/dashboard/"
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
            to="/dashboard/customers"
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
            to="/dashboard/contatti"
            className={
              isContatti
                ? cn(defaultListItemClass, "bg-slate-800 text-white")
                : cn(defaultListItemClass, "hover:bg-gray-300")
            }
          >
            <li className="flex place-items-center rounded-2xl text-inherit">
              <PhoneCall className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-bold text-inherit">Contatti</span>
              )}
            </li>
          </Link>
          <Link
            to="/dashboard/pratiche"
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
          {/* Admins only (AC1, AC28) */}
          {isAdmin ? (
            <Link
              to="/dashboard/import"
              className={
                isImport
                  ? cn(defaultListItemClass, "bg-slate-800 text-white")
                  : cn(defaultListItemClass, "hover:bg-gray-300")
              }
            >
              <li className="flex place-items-center rounded-2xl text-inherit">
                <UploadIcon className={iconClass} />
                {preference?.dashboardCollapsed ? null : (
                  <span className="font-bold text-inherit">Import</span>
                )}
              </li>
            </Link>
          ) : null}
        </ul>
        <div
          className={cn(
            "fixed bottom-0 left-0",
            preference?.dashboardCollapsed ? "w-16 p-2" : "w-72 p-4"
          )}
        >
          <Link
            to="/dashboard/profile"
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
