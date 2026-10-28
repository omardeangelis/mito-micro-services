import { useEffect, useRef, useState } from "react"
import { useRefreshAfterSave } from "./useRefreshAfterSave"

/**
 * The wait of a contact save, from the call until the refreshed page is on
 * screen: `saving` is set by `start()` and stays true until the refresh that
 * follows the server's answer ends, so the controls show the saved value
 * before they come back.
 *
 * - `start()` before the mutation;
 * - `finishAfterRefresh()` on success: the refresh starts and its end closes
 *   the wait;
 * - `awaitRefresh()` when a refresh is already under way (`onError` of
 *   `useContactMutationFeedback` starts it, given this hook's `refresh`);
 * - `fail()` when nothing was saved and nothing refreshes: the wait ends now.
 *
 * `onSettled` runs once the wait is over, for the focus restore.
 */
export const useSavingUntilRefreshed = (onSettled?: () => void) => {
  const { refresh, refreshing } = useRefreshAfterSave()
  const [saving, setSaving] = useState(false)
  // The server answered and the refresh started: its end closes the wait
  const awaitingRefresh = useRef(false)
  const settled = useRef(onSettled)
  settled.current = onSettled

  useEffect(() => {
    if (refreshing || !awaitingRefresh.current) return
    awaitingRefresh.current = false
    setSaving(false)
    settled.current?.()
  }, [refreshing])

  const awaitRefresh = () => {
    awaitingRefresh.current = true
  }
  const finishAfterRefresh = () => {
    awaitRefresh()
    refresh()
  }

  return {
    saving,
    pending: saving || refreshing,
    start: () => setSaving(true),
    fail: () => setSaving(false),
    awaitRefresh,
    finishAfterRefresh,
    refresh,
    refreshing,
  }
}
