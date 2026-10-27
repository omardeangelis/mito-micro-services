import { createContext, useState, type PropsWithChildren } from "react"
import {
  createUserPreferenceStore,
  type UserPreferenceStoreType,
} from "../userPreferences"

export const UserPreferenceContext =
  createContext<UserPreferenceStoreType | null>(null)

/**
 * The layout preferences of the dashboard, read from the `mito-pref-*`
 * cookies when the store is created, before the first render (F6): the
 * sidebar starts open or closed as it was, with no flicker.
 *
 * Role and operator come from the current user of `HttpApi` (phase 2), as
 * the copy of the preferences the server still keeps for who never had the
 * cookies (`copyServerPreferences` of the Next.js app): until then they stay
 * unset, so the admin-only items stay hidden
 */
export function UserPreferenceProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => createUserPreferenceStore({}))
  return (
    <UserPreferenceContext.Provider value={store}>
      {children}
    </UserPreferenceContext.Provider>
  )
}
