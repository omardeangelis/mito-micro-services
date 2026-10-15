"use client"

import { useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * `router.refresh()` inside a transition: `refreshing` stays true until the
 * refreshed server payload is rendered, so it says exactly when the saved
 * value is on screen. The wait of a save lasts from the call to that moment.
 */
export const useRefreshAfterSave = () => {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router]
  )
  return { refresh, refreshing }
}
