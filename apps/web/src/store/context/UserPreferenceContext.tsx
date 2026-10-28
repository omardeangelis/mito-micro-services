import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
import {
  createUserPreferenceStore,
  type UserPreferenceStoreType,
} from "../userPreferences"
import { useCurrentUser } from "@/api/me"
import {
  PREFERENCE_COOKIES,
  isPreferenceValue,
  readBrowserPreferences,
  writePreferenceCookie,
  type PreferenceKey,
} from "@mito/client/preferences/cookies"
import { type UserPreference } from "@mito/domain/schemas"
import { AppLoading } from "@/routes/AppLoading"

/** The copy of the preferences in `GET /me`, read key by key */
type ServerPreferences = Partial<Record<PreferenceKey, unknown>>

export const UserPreferenceContext =
  createContext<UserPreferenceStoreType | null>(null)

/**
 * The layout preferences of the dashboard and who the user is (2.2.2 of
 * brain/chore/fase-2-httpapi.md), as `UserPreferenceProvider` of the Next.js
 * app on `GET /api/v1/me`:
 * - the preferences come from the `mito-pref-*` cookies when the store is
 *   created, and a key with no cookie gets the copy the server still keeps,
 *   once (H4);
 * - role and operator come from the current user, never from the browser:
 *   another sign-in in the same browser would leave its own behind.
 * While the current user loads the skeleton shows; if it fails the children
 * render without a role, so the admin-only items stay hidden
 */
export function UserPreferenceProvider({ children }: PropsWithChildren) {
  const { data, isLoading } = useCurrentUser()
  const [store] = useState(() =>
    createUserPreferenceStore({
      preferences: validPreferences(data?.preferences),
      role: data?.role,
      operatorId: data?.operatorId,
    })
  )
  const copiedFrom = useRef<unknown>(undefined)
  const copyOnce = useCallback(
    (preferences: ServerPreferences | undefined) => {
      if (copiedFrom.current === preferences) return
      copiedFrom.current = preferences
      copyServerPreferences(store, preferences)
    },
    [store]
  )
  const childrenMounted = useRef(false)
  // Until the children mount the copy runs in the render, so a table seeds from
  // the copied columns; after that, setState in a render would hit components
  // that are subscribed, so it waits for the effect
  if (data && !childrenMounted.current) copyOnce(data.preferences)
  useEffect(() => {
    childrenMounted.current = !isLoading
    if (data) copyOnce(data.preferences)
  }, [data, isLoading, copyOnce])
  const role = data?.role
  const operatorId = data?.operatorId
  useEffect(() => {
    store.setState({ role, operatorId })
  }, [store, role, operatorId])
  if (isLoading) return <AppLoading />
  return (
    <UserPreferenceContext.Provider value={store}>
      {children}
    </UserPreferenceContext.Provider>
  )
}

/**
 * What an operator saved before the preferences moved to cookies: a key with no
 * cookie gets the server's value, once. A cookie that is there is never
 * overwritten.
 */
function copyServerPreferences(
  store: UserPreferenceStoreType,
  server: ServerPreferences | undefined
) {
  const valid = validPreferences(server)
  if (!valid) return
  const inBrowser = readBrowserPreferences()
  const copied: Partial<UserPreference> = {}
  for (const key of Object.keys(valid) as PreferenceKey[]) {
    if (inBrowser[key] !== undefined) continue
    writePreferenceCookie(key, valid[key] as never)
    ;(copied as Record<PreferenceKey, unknown>)[key] = valid[key]
  }
  if (Object.keys(copied).length === 0) return
  store.setState((state) => ({
    preferences: { ...state.preferences, ...copied },
  }))
}

/** The keys of the server's preferences whose value has the right type. */
function validPreferences(
  server: ServerPreferences | undefined
): Partial<UserPreference> | undefined {
  if (!server) return undefined
  const valid: Partial<UserPreference> = {}
  for (const key of Object.keys(PREFERENCE_COOKIES) as PreferenceKey[]) {
    // A value of the wrong type would be an unreadable cookie
    if (isPreferenceValue(key, server[key]))
      (valid as Record<PreferenceKey, unknown>)[key] = server[key]
  }
  return valid
}
