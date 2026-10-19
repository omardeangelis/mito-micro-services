import type { ReactNode } from "react"
import { ContactSheet } from "./_components/ContactSheet"

// Above `[id]`: a change of id (reopening, "Vai al contatto attivo") keeps the
// sheet mounted. No `loading.tsx` and no Suspense below it, which Next would
// remount and show their fallback on every change of id.
const ContactDetailLayout = ({ children }: { children: ReactNode }) => {
  return <ContactSheet>{children}</ContactSheet>
}

export default ContactDetailLayout
