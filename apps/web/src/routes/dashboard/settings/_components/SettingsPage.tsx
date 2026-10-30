import { type ReactNode, type Ref } from "react"
import { Navigate } from "react-router"
import { useCurrentUser } from "@/api/me"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { cn } from "@/lib/utils"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

/**
 * A page of the settings: its title and what it is for, then its sections.
 * `wide` for a table, the rest at the width of a form
 */
export const SettingsPage = ({
  title,
  description,
  back,
  aside,
  headingRef,
  wide = false,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** A link back, above the title */
  back?: ReactNode
  /** What sits next to the title: a badge, an action */
  aside?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  wide?: boolean
  children: ReactNode
}) => (
  <section className="dashabord-container">
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-8 py-10",
        wide ? "max-w-5xl" : "max-w-3xl"
      )}
    >
      <header className="flex flex-col gap-3">
        {back}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-title font-heading rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {title}
          </h1>
          {aside}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </div>
  </section>
)

export const SettingsLoading = () => (
  <div className="flex h-36 items-center justify-center">
    <LoadingSpinner />
  </div>
)

/**
 * The pages of the admins (Team, Blacklist): an operator goes to its
 * profile, as the tabs it couldn't see did; the endpoints check the role
 * again. Nothing until the role is known, and a failed current user is the
 * error of the route
 */
export const AdminOnly = ({ children }: { children: ReactNode }) => {
  const role = useUserPreferenceContext((state) => state.role)
  const { error, data } = useCurrentUser()
  if (role === undefined) {
    if (error && !data) throw error
    return null
  }
  if (role !== "ADMIN")
    return <Navigate to="/dashboard/settings/profile" replace />
  return children
}
