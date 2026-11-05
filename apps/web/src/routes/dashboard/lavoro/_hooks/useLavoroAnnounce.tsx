import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

type Announce = (text: string) => void

const AnnounceContext = createContext<Announce>(() => undefined)

/**
 * The one live region of the view, `sr-only` and there before anything is said.
 * Each announcement is a new node with its own `key`, or the same text said
 * twice would not be heard (as in `ContactSheet`)
 */
export function LavoroAnnounceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<{ key: number; text: string } | null>(
    null
  )
  const count = useRef(0)
  const announce = useCallback<Announce>((text) => {
    count.current += 1
    setStatus({ key: count.current, text })
  }, [])
  return (
    <AnnounceContext value={announce}>
      {children}
      <div role="status" className="sr-only">
        {status === null ? null : <p key={status.key}>{status.text}</p>}
      </div>
    </AnnounceContext>
  )
}

/** A stable function that announces `text` in the region of the view */
const useLavoroAnnounce = () => use(AnnounceContext)

/**
 * The «Riprova» of a part: the focus goes to `target` in the click, before the
 * button leaves with the error. Then the part waits for its query to rest, not
 * for that one read, which an update can cancel and replace: if the data are
 * there it says `announced`. Only this says it: a first load or an update on
 * their own say nothing, and `retrying` tells them from a «Riprova».
 *
 * The query comes from the parent, so the commit of the click still has it at
 * rest: the end is the data, or one failure more than `failures`, those at the
 * click
 */
export function useRetry(
  query: {
    refetch: () => Promise<unknown>
    fetchStatus: "fetching" | "paused" | "idle"
    isSuccess: boolean
    errorUpdateCount: number
  },
  announced: string,
  target: RefObject<HTMLElement | null>
) {
  const announce = useLavoroAnnounce()
  const { refetch, fetchStatus, isSuccess, errorUpdateCount } = query
  const [failures, setFailures] = useState<number | null>(null)
  const retry = useMemo(
    () => () => {
      target.current?.focus({ preventScroll: true })
      setFailures(errorUpdateCount)
      void refetch()
    },
    [refetch, errorUpdateCount, target]
  )
  const ended =
    failures !== null &&
    fetchStatus === "idle" &&
    (isSuccess || errorUpdateCount !== failures)
  useEffect(() => {
    if (!ended) return
    setFailures(null)
    if (isSuccess) announce(announced)
  }, [ended, isSuccess, announce, announced])
  return { retry, retrying: failures !== null && !ended }
}
