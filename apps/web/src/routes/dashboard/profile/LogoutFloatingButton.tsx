import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { clearUnsentNotes } from "@/components/custom/notes/unsentNote"
import { clearDeletingNotes } from "@/components/custom/notes/deletingNotes"
import { authClient } from "@/lib/authClient"

export const LogoutFloatingButton = () => {
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
    <button
      onClick={handleLogout}
      className="fixed bottom-4 right-1/2 translate-x-1/2 rounded-full bg-black px-4 py-2 text-white"
    >
      Esci dal gestionale
    </button>
  )
}
