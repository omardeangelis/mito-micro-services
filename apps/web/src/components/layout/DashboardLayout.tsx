import { Link } from "react-router"
import { cn } from "@/lib/utils"
import {
  FolderIcon,
  HomeIcon,
  PhoneCall,
  UserIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDownIcon,
  CircleUserIcon,
  SettingsIcon,
  ShieldBanIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { usePathname } from "@/lib/navigation"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

// Appendix C: 228 px open, 64 px closed
const uncollapsedClassWidth = "w-57"
const collapsedClassWidth = "w-16"
const transitionClass = "transition-all duration-300"
// The focus of the links and of the button (AC13): the ring, 2 px at 2 px
const focusClass =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
// Appendix C: icons of 17 px
const iconClass = "size-4.25 shrink-0"
const labelClass = "whitespace-nowrap"

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
  const isSettings = pathname.includes("dashboard/settings")
  const isImport = pathname.includes("dashboard/import")
  // Appendix C: items of 34 px; the current page's on `sidebar-primary`
  const listItemClass = useCallback(
    (active: boolean) =>
      cn(
        "flex h-8.5 place-items-center rounded-nav font-medium text-sidebar-foreground",
        focusClass,
        preference?.dashboardCollapsed ? "w-10 justify-center" : "px-2.5",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sidebar-active"
          : "hover:bg-sidebar-accent"
      ),
    [preference?.dashboardCollapsed]
  )

  const itemContentClass = useMemo(
    () =>
      cn(
        "flex place-items-center text-inherit",
        preference?.dashboardCollapsed ? null : "gap-2.5"
      ),
    [preference?.dashboardCollapsed]
  )

  return (
    <>
      <nav
        className={cn(
          "bg-sidebar text-sidebar-foreground fixed bottom-0 left-0 top-0 overflow-hidden",
          preference?.dashboardCollapsed
            ? collapsedClassWidth
            : uncollapsedClassWidth,
          transitionClass
        )}
      >
        <ul
          className={cn(
            "flex flex-col gap-0.5 pt-4",
            preference?.dashboardCollapsed ? "items-center px-2" : "px-2.5"
          )}
        >
          <Link
            to="/dashboard/"
            className={cn(
              "rounded-nav",
              focusClass,
              preference?.dashboardCollapsed ? null : "px-1.5"
            )}
          >
            <li className="flex place-items-center gap-2">
              <img
                src="/deutsche.png"
                alt="business-logo"
                width={24}
                height={24}
              />
              {preference?.dashboardCollapsed ? null : (
                <span className="font-heading whitespace-nowrap text-xl">
                  Mito SRL
                </span>
              )}
            </li>
          </Link>
          <Link
            to="/dashboard/"
            className={cn(listItemClass(isDashboard), "mt-4")}
          >
            <li className={itemContentClass}>
              <HomeIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className={labelClass}>Analisi</span>
              )}
            </li>
          </Link>
          <Link
            to="/dashboard/customers"
            className={listItemClass(isCustomers)}
          >
            <li className={itemContentClass}>
              <UserIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className={labelClass}>Clienti</span>
              )}
            </li>
          </Link>
          <Link to="/dashboard/pratiche" className={listItemClass(isPratiche)}>
            <li className={itemContentClass}>
              <FolderIcon className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className={labelClass}>Pratiche</span>
              )}
            </li>
          </Link>
          <Link to="/dashboard/contatti" className={listItemClass(isContatti)}>
            <li className={itemContentClass}>
              <PhoneCall className={iconClass} />
              {preference?.dashboardCollapsed ? null : (
                <span className={labelClass}>Chiamate</span>
              )}
            </li>
          </Link>
          {/* Admins only (AC1, AC28) */}
          {isAdmin ? (
            <Link to="/dashboard/import" className={listItemClass(isImport)}>
              <li className={itemContentClass}>
                <UploadIcon className={iconClass} />
                {preference?.dashboardCollapsed ? null : (
                  <span className={labelClass}>Import</span>
                )}
              </li>
            </Link>
          ) : null}
        </ul>
        <div
          className={cn(
            "fixed bottom-0 left-0 flex flex-col pb-4",
            preference?.dashboardCollapsed
              ? "w-16 items-center px-2"
              : "w-57 px-2.5"
          )}
        >
          <SettingsSection
            pathname={pathname}
            isAdmin={isAdmin}
            collapsed={preference?.dashboardCollapsed ?? false}
            isSettings={isSettings}
            listItemClass={listItemClass}
            itemContentClass={itemContentClass}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className={cn(
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              focusClass
            )}
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
          preference?.dashboardCollapsed ? "min-w-16" : "min-w-57",
          transitionClass
        )}
      />
    </>
  )
}

type SettingsItem = { to: string; label: string; icon: LucideIcon }

/**
 * Impostazioni, at the bottom of the sidebar: a section that opens on its
 * pages (Profilo for everyone, Team and Blacklist for the admins). Closed
 * sidebar: only the icons of the pages, named by their label
 */
const SettingsSection = ({
  pathname,
  isAdmin,
  collapsed,
  isSettings,
  listItemClass,
  itemContentClass,
}: {
  pathname: string
  isAdmin: boolean
  collapsed: boolean
  isSettings: boolean
  listItemClass: (active: boolean) => string
  itemContentClass: string
}) => {
  const [open, setOpen] = useState(isSettings)
  const items: SettingsItem[] = [
    {
      to: "/dashboard/settings/profile",
      label: "Profilo",
      icon: CircleUserIcon,
    },
    ...(isAdmin
      ? [
          { to: "/dashboard/settings/team", label: "Team", icon: UsersIcon },
          {
            to: "/dashboard/settings/blacklist",
            label: "Blacklist",
            icon: ShieldBanIcon,
          },
        ]
      : []),
  ]
  const links = (
    <ul
      id="settings-pages"
      className={cn(
        "flex flex-col gap-0.5",
        collapsed ? "items-center" : "ml-4.5 border-l border-border pl-2"
      )}
    >
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <Link
            to={to}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            aria-current={pathname.startsWith(to) ? "page" : undefined}
            className={listItemClass(pathname.startsWith(to))}
          >
            <span className={itemContentClass}>
              <Icon className={iconClass} />
              {collapsed ? null : <span className={labelClass}>{label}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
  if (collapsed) return <div className="mb-4">{links}</div>
  return (
    <div className="mb-4 flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="settings-pages"
        onClick={() => setOpen((current) => !current)}
        className={cn(listItemClass(false), "w-full justify-between")}
      >
        <span className={itemContentClass}>
          <SettingsIcon className={iconClass} />
          <span className={labelClass}>Impostazioni</span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-150",
            open ? null : "-rotate-90"
          )}
        />
      </button>
      {open ? links : null}
    </div>
  )
}
