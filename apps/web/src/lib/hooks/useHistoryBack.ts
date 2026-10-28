import { useCallback } from "react"
import { useNavigate } from "react-router"
import { useIsMounted } from "./useIsMounted"

/**
 * Leaves a page opened over another, as a sheet: back to the page before
 * when the app has one, to `fallbackUrl` otherwise (a link opened in a new
 * tab)
 */
export const useHistoryBack = () => {
  const navigate = useNavigate()
  const isMounted = useIsMounted()
  const handleRouteChangeOnClose = useCallback(
    (fallbackUrl: string) => {
      if (!isMounted()) return
      // React Router counts its entries in `history.state.idx`: 0 is the
      // first page of the app in this tab
      const state = window.history.state as { idx?: number } | null
      if ((state?.idx ?? 0) > 0) void navigate(-1)
      else void navigate(fallbackUrl)
    },
    [isMounted, navigate]
  )

  return handleRouteChangeOnClose
}
