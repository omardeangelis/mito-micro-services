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
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"

export const UserPreferenceContext =
  createContext<UserPreferenceStoreType | null>(null)

export const UserPreferenceProvider: FC<PropsWithChildren> = ({ children }) => {
  const { data, isLoading } = api.user.getUserPreference.useQuery()
  const prefStore = createUserPreferenceStore({
    preferences: data?.preferences,
    role: data?.role,
    operatorId: data?.operatorId,
  })
  const store = useRef(prefStore).current
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
