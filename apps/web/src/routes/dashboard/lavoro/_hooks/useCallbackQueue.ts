import { format } from "date-fns"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { type CallOutcome } from "@mito/domain/contact/outcome"
import { operatorDisplayName } from "@mito/domain/contact/permissions"
import { customerNameOf } from "@/components/custom/contact/call/customerName"
import {
  nextTick,
  useMyCallbacks,
  useMyCalls,
  useRefreshHome,
} from "@/api/home"
import { useKnownCurrentUser } from "@/api/me"
import {
  type RegisterCallInput,
  type RegisterCallResult,
  useRegisterCall,
} from "@/api/task"
import { registeredNotice } from "../_lib/format"
import {
  applyRegistered,
  applyWorked,
  load,
  markResponded,
  markUncertain,
  nextFocus,
  type Queue,
  type QueueRow,
  reconcile,
  settleUncertain,
} from "../_lib/queue"
import { showRejection, showUncertain } from "../_lib/notices"
import {
  type CallRejection,
  describeCallRejection,
  reloadsRows,
} from "../_lib/rejection"
import { useOpenContact } from "../../contatti/detail/useContactOverlay"

/** A press of an outcome on a row: for Richiamare, with its day and message */
export type Register = (
  row: QueueRow,
  outcome: CallOutcome,
  day: Date | undefined,
  message: string | undefined
) => void

/** The row whose outcomes or panel hold the focus */
const focusedControl = () => {
  const control = document.activeElement?.closest("[data-call-control]")
  const alertId = control?.getAttribute("data-call-control")
  return alertId == null ? null : Number(alertId)
}

const rowOf = (queue: Queue | null, alertId: number) =>
  queue?.find((row) => row.alertId === alertId)

const isClosed = (queue: Queue | null, alertId: number) =>
  rowOf(queue, alertId)?.closure != null

const hasUncertainPress = (queue: Queue | null, alertId: number) =>
  (rowOf(queue, alertId)?.uncertainRequestIds.length ?? 0) > 0

/** `map` with no `key`, the same one if it didn't have it */
const without = <V>(map: ReadonlyMap<number, V>, key: number) => {
  if (!map.has(key)) return map
  const next = new Map(map)
  next.delete(key)
  return next
}

/** What the server gets for a press; Richiamare always has its day */
const pressInput = (
  row: QueueRow,
  outcome: CallOutcome,
  day: Date | undefined,
  message: string | undefined
): RegisterCallInput | null => {
  const common = {
    taskId: row.taskId,
    source: "list" as const,
    workingAlertId: row.alertId,
  }
  if (outcome !== "richiamare") return { ...common, outcome }
  if (day === undefined) return null
  return {
    ...common,
    outcome,
    callback: { day: format(day, "yyyy-MM-dd"), message: message ?? null },
  }
}

/** What a refused press says: `null` for any other answer */
const rejectionOf = (
  result: RegisterCallResult,
  row: QueueRow,
  outcome: CallOutcome
): CallRejection | null => {
  const context = { customer: customerNameOf(row), outcome }
  switch (result.kind) {
    case "rejected":
      return describeCallRejection(result.error, context)
    case "refused":
      return describeCallRejection(null, context)
    case "registered":
    case "uncertain":
      return null
  }
}

/**
 * What an answer does to its row, the one place that tells them apart: a
 * call registered or worked by someone else closes it, an uncertain one waits
 * for the diary, any other answer leaves it as it is
 */
const applyAnswer = (
  queue: Queue,
  alertId: number,
  result: RegisterCallResult,
  rejection: CallRejection | null
): Queue => {
  if (result.kind === "registered")
    return applyRegistered(queue, alertId, result.registered)
  if (result.kind === "uncertain")
    return markUncertain(queue, alertId, result.requestId)
  if (rejection?.kind === "worked")
    return applyWorked(queue, alertId, rejection.by, rejection.at)
  return queue
}

/** The name of a row, a link: where the focus lands */
const callbackLink = (alertId: number | null) =>
  document.querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)

/**
 * The rows of «Richiami da fare» of this visit, `null` until they load, and
 * the presses of their outcomes.
 *
 * The first read that succeeds fills the queue, without waiting for the diary,
 * and every later one, «Riprova» included, reconciles it (AC23, AC37, AC39).
 * Before that the diary settles the uncertain presses, even with no new read
 * of the rows: it may have the call when they failed (AC48). The effect stops
 * on its own: both return the same queue when nothing changes. Every write is `writeQueue`, in the function form: a queue computed
 * from this render would lose an answer that came between the commit and the
 * effect.
 *
 * The presses under way are `sending`, for what the rows show, and a `Set` in
 * a ref, which locks a second press in the same tick (AC26). An answer takes
 * its row out of both in the update that writes it, so `reconcile` never sees
 * a press ended with no answer on the row, and marks `respondedTick` before
 * anything reads the rows again (D8).
 *
 * `failures` are the rows whose last Richiamare was refused or uncertain:
 * `true`, or the text under the calendar. They change with `sending`, because the panel
 * closes and empties its draft if `pending` ends without them (AC20), and a
 * new press on the row clears them.
 *
 * The focus: `writeQueue` notes which control has it, because closing a row
 * takes it away. If that row closed, whatever closed it, the layout effect
 * moves it on the queue that was committed, where the link exists (AC20,
 * AC23). A focus the user took elsewhere isn't on the control, so it stays.
 *
 * An answer may come with the home gone, as `mutateAsync` still resolves: then
 * it is only a notice, with no state and no read (AC52). The lock belongs to
 * this visit, so a home opened again starts free.
 */
export const useCallbackQueue = () => {
  const callbacks = useMyCallbacks()
  const calls = useMyCalls()
  const { mutateAsync } = useRegisterCall({ quietFailure: true })
  const { refreshAll, refreshRows } = useRefreshHome()
  const navigate = useNavigate()
  const openContact = useOpenContact()
  const { data: me } = useKnownCurrentUser()
  // Read at the answer, so `register` stays the same one; `by` is this name
  const ownName = useRef<string | null>(null)
  ownName.current = me ? operatorDisplayName(me.operator) : null
  const [queue, setQueue] = useState<Queue | null>(null)
  const [sending, setSending] = useState<ReadonlyMap<number, CallOutcome>>(
    () => new Map()
  )
  const [failures, setFailures] = useState<ReadonlyMap<number, string | true>>(
    () => new Map()
  )
  const locked = useRef(new Set<number>())
  const focusedBeforeWrite = useRef<number | null>(null)
  const committed = useRef<Queue | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const openHere = useCallback(
    (taskId: number, alertId: number) => {
      if (!mounted.current) return false
      openContact(taskId, callbackLink(alertId))
      return true
    },
    [openContact]
  )

  const writeQueue = useCallback(
    (update: (queue: Queue | null) => Queue | null) => {
      focusedBeforeWrite.current = focusedControl()
      setQueue(update)
    },
    []
  )

  const read = callbacks.data
  const diary = calls.data
  const diaryIdle = calls.fetchStatus === "idle"
  const sendingRows = useMemo(() => new Set(sending.keys()), [sending])
  useEffect(() => {
    writeQueue((current) => {
      if (current === null) return read === undefined ? null : load(read.rows)
      const settled = settleUncertain(current, diary ?? [], {
        sending: sendingRows,
      })
      return read === undefined
        ? settled
        : reconcile(settled, read, { sending: sendingRows, diaryIdle })
    })
  }, [read, diary, diaryIdle, sendingRows, writeQueue])

  useLayoutEffect(() => {
    const before = committed.current
    committed.current = queue
    const alertId = focusedBeforeWrite.current
    if (queue === null || alertId === null) return
    if (isClosed(before, alertId) || !isClosed(queue, alertId)) return
    callbackLink(nextFocus(queue, alertId))?.focus()
  }, [queue])

  const register = useCallback<Register>(
    (row, outcome, day, message) => {
      const { alertId } = row
      const input = pressInput(row, outcome, day, message)
      if (input === null || locked.current.has(alertId)) return
      locked.current.add(alertId)
      setSending((current) => new Map(current).set(alertId, outcome))
      setFailures((current) => without(current, alertId))

      // `mutateAsync` resolves also after an unmount; it never rejects
      void mutateAsync(input).then((result) => {
        const rejection = rejectionOf(result, row, outcome)
        const here = mounted.current
        // «Worked» by the user, on a row with an uncertain press: that press
        // was written, and the diary will close the row with its own outcome
        // (AC23, AC48). A colleague has the notice, and so has an unknown user
        const ownCall =
          here &&
          rejection?.kind === "worked" &&
          rejection.by === ownName.current &&
          hasUncertainPress(committed.current, alertId)
        if (here) {
          const tick = nextTick()
          locked.current.delete(alertId)
          setSending((current) => without(current, alertId))
          if (
            outcome === "richiamare" &&
            (rejection !== null || result.kind === "uncertain")
          ) {
            const failure =
              rejection?.kind === "deadlinePast" ? rejection.text : true
            setFailures((current) => new Map(current).set(alertId, failure))
          }
          writeQueue(
            (current) =>
              current &&
              applyAnswer(
                markResponded(current, alertId, tick),
                alertId,
                result,
                rejection
              )
          )
          // After the tick: these reads are newer than the answer (D8)
          if (result.kind === "uncertain") void refreshAll()
          else if (rejection !== null && reloadsRows(rejection))
            void refreshRows()
        }
        if (result.kind === "registered") {
          toast.success(
            registeredNotice(
              outcome,
              result.registered.alert?.day ?? null,
              customerNameOf(row)
            ),
            { description: outcome === "richiamare" ? message : undefined }
          )
        } else if (result.kind === "uncertain") {
          showUncertain()
        } else if (rejection !== null && !ownCall) {
          showRejection(rejection, row, { navigate, openHere }, { here })
        }
      })
    },
    [mutateAsync, navigate, openHere, refreshAll, refreshRows, writeQueue]
  )

  return { queue, callbacks, sending, failures, register }
}
