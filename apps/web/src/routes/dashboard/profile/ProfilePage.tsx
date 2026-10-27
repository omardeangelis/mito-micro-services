import { useSearchParams } from "react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

const TABS = ["profile", "admin", "blacklist"] as const
type ProfileTab = (typeof TABS)[number]

const isTab = (value: string | null): value is ProfileTab =>
  TABS.some((tab) => tab === value)

/**
 * The profile, with the tabs that in the Next.js app are the parallel routes
 * `@admin` and `@blacklist` (§5): Admin and Blacklist only for the ADMIN, the
 * tab in the URL (`?tab=admin`), so a link opens it and the back button
 * returns to the previous one. A tab the user can't see opens the profile.
 * The content of each tab arrives with 3.8
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
          Il profilo arriva con il task 3.8
        </TabsContent>
        {isAdmin ? (
          <>
            <TabsContent value="admin">
              Gli operatori arrivano con il task 3.8
            </TabsContent>
            <TabsContent value="blacklist">
              La blacklist arriva con il task 3.8
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </section>
  )
}
