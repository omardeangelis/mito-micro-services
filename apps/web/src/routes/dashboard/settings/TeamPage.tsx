import { useEffect, useRef } from "react"
import { Link, useLocation } from "react-router"
import { ChevronRightIcon } from "lucide-react"
import { useTeam } from "@/api/operator"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import {
  AdminOnly,
  SettingsLoading,
  SettingsPage,
} from "./_components/SettingsPage"
import { memberName, roleLabel } from "./_lib/role"

/** What a page that sends back to the team asks of it */
export type TeamLocationState = { focusHeading?: boolean }

/**
 * Team, in the settings (admins only): who uses the CRM, with email and
 * role, by surname. Each member opens its page, where the admin changes the
 * role or deactivates it. A member deactivated from its page comes back here
 * with the focus on the title
 */
export function Component() {
  return (
    <AdminOnly>
      <Team />
    </AdminOnly>
  )
}

const Team = () => {
  const { data } = useTeam()
  const me = useUserPreferenceContext((state) => state.operatorId)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const state = useLocation().state as TeamLocationState | null
  useEffect(() => {
    if (state?.focusHeading) headingRef.current?.focus()
  }, [state])

  return (
    <SettingsPage
      title="Team"
      headingRef={headingRef}
      description="Chi usa il gestionale e con quale ruolo. Una persona entra nel team al suo primo accesso."
      aside={
        data ? (
          <span className="text-sm text-muted-foreground">
            {data.length === 1 ? "1 membro" : `${data.length} membri`}
          </span>
        ) : null
      }
    >
      {data === undefined ? (
        <SettingsLoading />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul aria-label="Membri del team" className="divide-y divide-border">
            {data.map((member) => (
              <li key={member.id}>
                <Link
                  to={`/dashboard/settings/team/${member.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {memberName(member)}
                      {member.id === me ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (tu)
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                  <Badge tone={member.role === "ADMIN" ? "indigo" : "neutral"}>
                    {roleLabel(member.role)}
                  </Badge>
                  <ChevronRightIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </SettingsPage>
  )
}
