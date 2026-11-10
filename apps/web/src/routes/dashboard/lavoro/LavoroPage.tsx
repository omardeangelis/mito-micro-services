import { CallbacksSection } from "./_components/CallbacksSection"
import { useRefreshHome } from "@/api/home"
import { ContactOverlay } from "../contatti/detail/ContactOverlay"
import { DiarySection } from "./_components/DiarySection"
import { LavoroAnnounceProvider } from "./_hooks/useLavoroAnnounce"
import { Header } from "./_components/Header"

/**
 * The day of who is signed in: `/dashboard` for an operator, `/dashboard/lavoro`
 * for everyone. It scrolls on its own, not as `.dashabord-container`, whose
 * horizontal scrollbar the table of the callbacks can't live with. The detail
 * of a contact opens over it, so it stays as it is (AC53)
 */
export function Lavoro() {
  // Stable: the overlay's effect depends on it
  const { refreshAll } = useRefreshHome()
  return (
    // `relative`: the `sr-only` region is `absolute` and, with no positioned
    // ancestor, would widen the document
    <div data-lavoro-scroll className="relative h-full overflow-y-auto">
      <LavoroAnnounceProvider>
        <ContactOverlay onClose={refreshAll}>
          <div className="flex flex-col gap-6 p-4 pb-12">
            <Header />
            <CallbacksSection />
            <DiarySection />
          </div>
        </ContactOverlay>
      </LavoroAnnounceProvider>
    </div>
  )
}

export { Lavoro as Component }
