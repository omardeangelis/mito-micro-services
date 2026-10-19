"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type HiddenColumns = readonly [
  hidden: readonly string[],
  setHidden: (hidden: string[]) => void,
]

const HiddenColumnsContext = createContext<HiddenColumns | null>(null)

/**
 * The columns the operator hid, shared by the menu in the filter bar and the
 * table below it: the prop only seeds them, the menu changes them at once.
 */
export function HiddenColumnsProvider({
  initial,
  children,
}: {
  initial: readonly string[]
  children: ReactNode
}) {
  const [hidden, setHidden] = useState(initial)

  return (
    <HiddenColumnsContext.Provider value={[hidden, setHidden]}>
      {children}
    </HiddenColumnsContext.Provider>
  )
}

/**
 * The hidden columns of the provider; without one (a table alone) they are
 * the table's own, seeded with `seed`.
 */
export function useHiddenColumns(seed: readonly string[] = []): HiddenColumns {
  const shared = useContext(HiddenColumnsContext)
  const [own, setOwn] = useState(seed)

  return shared ?? [own, setOwn]
}
