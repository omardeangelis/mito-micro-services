import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { clearUnsentNotes } from "@/components/custom/notes/unsentNote"
import { clearDeletingNotes } from "@/components/custom/notes/deletingNotes"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/authClient"

/**
 * "Esci dal gestionale": the session closes, and what this tab kept of the
 * operator (unsent notes, deletions, the answers of the backend) goes
 */
export const LogoutButton = () => {
  const logoutStore = useUserPreferenceContext((state) => state.logout)
  const queryClient = useQueryClient()
  const handleLogout = useCallback(async () => {
    // Unsent notes and deletions are of this operator: not for the next one
    // in this tab
    clearUnsentNotes()
    clearDeletingNotes()
    await authClient.signOut()
    logoutStore()
    // What the backend answered is of this operator too (H12)
    queryClient.clear()
    window.location.assign("/")
  }, [logoutStore, queryClient])
  return (
    <Button variant="outline" onClick={handleLogout}>
      Esci dal gestionale
    </Button>
  )
}
