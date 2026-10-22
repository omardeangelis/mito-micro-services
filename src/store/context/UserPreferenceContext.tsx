"use client"
import {
  createContext,
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
  readBrowserPreferences,
  writePreferenceCookie,
  type PreferenceKey,
} from "@/lib/preferences/cookies"
import { type UserPreference } from "@mito/domain/schemas"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"

export const UserPreferenceContext =
  createContext<UserPreferenceStoreType | null>(null)

export const UserPreferenceProvider: FC<PropsWithChildren> = ({ children }) => {
  const { data, isLoading } = api.user.getUserPreference.useQuery()
  const storeRef = useRef<UserPreferenceStoreType>()
  storeRef.current ??= createUserPreferenceStore({
    preferences: data?.preferences,
    role: data?.role,
    operatorId: data?.operatorId,
  })
  const store = storeRef.current
  // Before the children render, so a table seeds from the copied columns
  const copiedFrom = useRef<unknown>()
  if (data && copiedFrom.current !== data.preferences) {
    copiedFrom.current = data.preferences
    copyServerPreferences(store, data.preferences)
  }
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
  if (!server) return
  const inBrowser = readBrowserPreferences()
  const copied: Partial<UserPreference> = {}
  for (const key of Object.keys(PREFERENCE_COOKIES) as PreferenceKey[]) {
    const value = server[key]
    if (inBrowser[key] !== undefined || value === undefined) continue
    writePreferenceCookie(key, value as never)
    ;(copied as Record<PreferenceKey, unknown>)[key] = value
  }
  if (Object.keys(copied).length === 0) return
  store.setState((state) => ({
    preferences: { ...state.preferences, ...copied },
  }))
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
