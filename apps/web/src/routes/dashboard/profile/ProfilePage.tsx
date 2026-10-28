import { useSearchParams } from "react-router"
import { useCurrentUser } from "@/api/me"
import { useAssignableOperators } from "@/api/operator"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { BlackList } from "./_components/BlackList"
import { OperatorTable } from "./_components/OperatorTable"
import { ProfileForm } from "./_components/ProfileForm"
import { LogoutFloatingButton } from "./LogoutFloatingButton"

const TABS = ["profile", "admin", "blacklist"] as const
type ProfileTab = (typeof TABS)[number]

const isTab = (value: string | null): value is ProfileTab =>
  TABS.some((tab) => tab === value)

/**
 * The profile, with the tabs that in the Next.js app are the parallel routes
 * `@admin` and `@blacklist` (§5): Admin and Blacklist only for the ADMIN, the
 * tab in the URL (`?tab=admin`), so a link opens it and the back button
 * returns to the previous one. A tab the user can't see opens the profile.
 * Each tab reads its data when it opens
 */
export function Component() {
  const isAdmin = useUserPreferenceContext((state) => state.role) === "ADMIN"
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("tab")
  const tab: ProfileTab =
    isTab(requested) && (isAdmin || requested === "profile")
      ? requested
      : "profile"

  const select = (value: string) => {
    if (!isTab(value)) return
    setSearchParams((params) => {
      if (value === "profile") params.delete("tab")
      else params.set("tab", value)
      return params
    })
  }

  return (
    <section className="dashabord-container">
      <Tabs
        value={tab}
        onValueChange={select}
        className="mx-auto flex min-w-[676px] max-w-xl flex-col gap-4 rounded-md bg-white p-4"
      >
        <TabsList
          className={cn("grid w-full", isAdmin ? "grid-cols-3" : "grid-cols-1")}
        >
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {isAdmin ? (
            <>
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <TabsContent value="profile">
          <OwnProfile />
          <LogoutFloatingButton />
        </TabsContent>
        {isAdmin ? (
          <>
            <TabsContent value="admin">
              <Operators />
            </TabsContent>
            <TabsContent value="blacklist">
              <BlackList />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </section>
  )
}

const Loading = () => (
  <div className="flex h-36 items-center justify-center">
    <LoadingSpinner />
  </div>
)

/**
 * The own name and surname, as the page of the profile of the Next.js app.
 * Without the current user the page can't show them: a failed read goes to
 * the error of the route
 */
const OwnProfile = () => {
  const { data, error } = useCurrentUser()
  if (!data) {
    if (error) throw error
    return <Loading />
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-medium">Aggiorna le tue informazioni</h1>
      <ProfileForm operator={data.operator} />
    </div>
  )
}

/** The operators, as the parallel route `@admin` of the Next.js app */
const Operators = () => {
  const operatorId = useUserPreferenceContext((state) => state.operatorId)
  const { data } = useAssignableOperators({ enabled: true })
  if (!data) return <Loading />
  return <OperatorTable data={data} currentOperatorId={operatorId} />
}
