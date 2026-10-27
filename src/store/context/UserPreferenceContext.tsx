"use client"
import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  type FC,
  type PropsWithChildren,
} from "react"
import {
  createUserPreferenceStore,
  type UserPreferenceStoreType,
} from "../userPreferences"
import { api } from "@/trpc/react"
import {
  PREFERENCE_COOKIES,
  isPreferenceValue,
  readBrowserPreferences,
  writePreferenceCookie,
  type PreferenceKey,
} from "@mito/client/preferences/cookies"
import { type UserPreference } from "@mito/domain/schemas"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"

export const UserPreferenceContext =
  createContext<UserPreferenceStoreType | null>(null)

export const UserPreferenceProvider: FC<PropsWithChildren> = ({ children }) => {
  const { data, isLoading } = api.user.getUserPreference.useQuery()
  const storeRef = useRef<UserPreferenceStoreType>()
  storeRef.current ??= createUserPreferenceStore({
    preferences: validPreferences(data?.preferences),
    role: data?.role,
    operatorId: data?.operatorId,
  })
  const store = storeRef.current
  // Nothing under the provider is server-rendered: the gate renders the
  // skeleton while the query loads, and the query is not prefetched on the
  // server. If that changes, seed the store on the server from the request
  // cookies (`readRequestPreferences`), or the sidebar and the copied keys
  // would mismatch at hydration.
  const copiedFrom = useRef<unknown>()
  const copyOnce = useCallback(
    (preferences: Partial<UserPreference> | null | undefined) => {
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
  // Who the user is comes from the session, never from the browser: another
  // sign-in in the same browser would leave its role and operator behind
  useEffect(() => {
    store.setState({ role, operatorId })
  }, [store, role, operatorId])
  if (isLoading) return <GenericLoading />
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
  server: Partial<UserPreference> | null | undefined
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
  server: Partial<UserPreference> | null | undefined
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

function GenericLoading() {
  return (
    <div className="relative flex flex-row">
      <div className="h-screen w-16 bg-gray-100" />
      <section className="dashabord-container">
        <div className="dashbaord-layout p-4">
          <TableSkeleton rows={10} />
        </div>
      </section>
    </div>
  )
}
