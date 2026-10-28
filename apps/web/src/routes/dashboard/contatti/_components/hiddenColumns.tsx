import { createContext, useContext, useState, type ReactNode } from "react"
import { useOptionalUserPreferenceContext } from "@/store/context/useOptionalUserPreferenceContext"

type HiddenColumns = readonly [
  hidden: readonly string[],
  setHidden: (hidden: string[]) => void,
]

const HiddenColumnsContext = createContext<HiddenColumns | null>(null)

/**
 * The columns the operator hid, shared by the menu in the filter bar and the
 * table below it: the menu changes them at once. They start from the store when
 * it has a choice, else from the prop, which is only the render of the server
 * (the router cache can keep it for 30 seconds).
 */
export function HiddenColumnsProvider({
  initial,
  children,
}: {
  initial: readonly string[]
  children: ReactNode
}) {
  const stored = useOptionalUserPreferenceContext(
    (state) => state.preferences?.contactTableVisibleColumns
  )
  const [hidden, setHidden] = useState(stored ?? initial)

  return (
    <HiddenColumnsContext.Provider value={[hidden, setHidden]}>
      {children}
    </HiddenColumnsContext.Provider>
  )
}

/**
 * The hidden columns of the provider; without one (a table alone) they are
 * the table's own, seeded like the provider's, with `seed` as the server's.
 */
export function useHiddenColumns(seed: readonly string[] = []): HiddenColumns {
  const shared = useContext(HiddenColumnsContext)
  const stored = useOptionalUserPreferenceContext(
    (state) => state.preferences?.contactTableVisibleColumns
  )
  const [own, setOwn] = useState(stored ?? seed)

  return shared ?? [own, setOwn]
}
