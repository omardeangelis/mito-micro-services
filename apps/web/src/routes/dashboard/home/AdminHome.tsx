import {
  useAdminCallbacks,
  useLatestWaves,
  useRefreshAdminHome,
  useTeamDay,
  useTeamDetail,
} from "@/api/home"
import { useKnownCurrentUser } from "@/api/me"
import { ContactOverlay } from "../contatti/detail/ContactOverlay"
import { greeting, longDay } from "../lavoro/_lib/format"
import { CallsSection } from "./_components/export/CallsSection"
import { LatestWaves } from "./_components/LatestWaves"
import { QuickActions } from "./_components/QuickActions"
import { TeamDetail } from "./_components/TeamDetail"
import { TodayStrip } from "./_components/TodayStrip"

/**
 * The home of the admins: the day of the team, the last imports and the export
 * of the calls. The four reads are here and only here: with `staleTime` 0 every
 * observer mounted later would read again. It scrolls on its own, as `lavoro`,
 * not as `.dashabord-container`, so the page never scrolls sideways (D8)
 */
export function AdminHome() {
  const { data } = useKnownCurrentUser()
  const day = useTeamDay()
  const callbacks = useAdminCallbacks()
  const waves = useLatestWaves()
  const team = useTeamDetail()
  // Stable: the overlay's effect depends on it
  const refresh = useRefreshAdminHome()
  return (
    <div data-admin-scroll className="relative h-full overflow-y-auto">
      <ContactOverlay onClose={refresh}>
        <div className="flex flex-col gap-6 p-4 pb-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-title">
                {greeting(data?.operator.name)}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {longDay(new Date())}
              </p>
            </div>
            <QuickActions />
          </div>
          <TodayStrip day={day} callbacks={callbacks} />
          <LatestWaves waves={waves} />
          <TeamDetail team={team} waves={waves} />
          <CallsSection />
        </div>
      </ContactOverlay>
    </div>
  )
}
