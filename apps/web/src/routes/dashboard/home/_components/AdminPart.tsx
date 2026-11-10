import { type UseQueryResult } from "@tanstack/react-query"
import { type ReactNode, type RefObject } from "react"
import { useRetryPart } from "@/api/home"
import { PartError } from "../../lavoro/_components/PartError"
import { useRetryFocus } from "../_hooks/useRetryFocus"
import { partState } from "../_lib/part"

/**
 * A part of the admin's home on a query of `AdminHome`, which loads and fails
 * on its own (AC30). Not `Part` of `lavoro`: here a failed read takes the place
 * of the data, «Riprova» brings the skeleton back, and the focus moves when the
 * read ends, to `focus` if the data came (AC49). `what` completes «Non è stato
 * possibile caricare …», `retryKey` is the key of the query
 */
export function AdminPart<A>({
  query,
  retryKey,
  what,
  loading,
  focus,
  inset = false,
  children,
}: {
  query: UseQueryResult<A>
  retryKey: readonly unknown[]
  what: string
  loading: ReactNode
  focus: RefObject<HTMLElement | null>
  inset?: boolean
  children: (data: A) => ReactNode
}) {
  const retryPart = useRetryPart()
  const { retryRef, armRetryFocus } = useRetryFocus(query, focus)
  const state = partState(query)
  if (state === "loading") return loading
  if (state === "error")
    return (
      <PartError
        what={what}
        inset={inset}
        retryRef={retryRef}
        onRetry={() => {
          armRetryFocus()
          void retryPart(retryKey)
        }}
      />
    )
  return children(query.data as A)
}
