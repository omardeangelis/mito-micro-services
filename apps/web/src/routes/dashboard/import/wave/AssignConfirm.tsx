import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  importKeys,
  useAssign,
  useWave,
  type WaveMutationCallbacks,
  type WaveView,
} from "@/api/import"
import { isApiFailure } from "@/api/errors"
import { Button } from "@/components/ui/button"
import { type DoneContent } from "./_lib/mode"
import { assignedText, dayText, formatNumber } from "./_lib/text"
import { Extend } from "./Extend"
import { type FlowStep } from "./Flow"
import {
  assignHeader,
  splitFlowStep,
  type Preview,
  type Split,
} from "./split/SplitStep"
import { type SplitNotice } from "./split/SplitSummary"

/** How a failed confirmation ended (AC16, D17) */
export type FailureKind =
  | "numbersChanged"
  | "nothingToMove"
  | "uncertain"
  | "session"
  | "refused"
  | "failed"

/**
 * The kind of a failure of `assign` or `move`, from the tag of the contract
 * (D17). `NothingToMove` is the reassignment's numbers changed, with its own
 * message (AC26)
 */
export function failureKind(error: unknown): FailureKind {
  if (!isApiFailure(error)) return "failed"
  switch (error._tag) {
    case "NumbersChanged":
      return "numbersChanged"
    case "NothingToMove":
      return "nothingToMove"
    case "ApiUnavailable":
      return "uncertain"
    case "Unauthorized":
    case "OperatorDisabled":
      return "session"
    case "NotAdmin":
    case "NotAnOperator":
      return "refused"
    default:
      return "failed"
  }
}

/** The texts of the outcomes (AC16) that differ between «Assegna» and «Sposta» */
export type ConfirmTexts = {
  /** «Solo un admin può assegnare contatti.» */
  readonly refused: string
  /** The message after a `NumbersChanged` (or `NothingToMove`) */
  readonly numbersChanged: string
  /** The message after a `NothingToMove` (AC26); `numbersChanged` when absent */
  readonly nothingToMove?: string
}

export const NUMBERS_CHANGED =
  "I numeri sono cambiati: controlla l'anteprima e conferma di nuovo."
const UNCERTAIN =
  "Non sappiamo se l'operazione è andata a buon fine. I numeri qui sopra sono aggiornati: controlla l'anteprima prima di confermare di nuovo."
const SESSION =
  "La sessione è scaduta: accedi di nuovo. Nessun contatto è cambiato."
const FAILED = "Non è stato possibile completare l'operazione. Riprova."
const REREAD_FAILED = "Non è stato possibile rileggere i numeri."

/** A message of AC16 in the summary of the step */
type Shown = {
  readonly text: string
  /** The confirmation stays off while the step is open: the session, the permission */
  readonly sticky: boolean
  /** After a re-read: an invalid preview says its own message instead (AC14) */
  readonly yieldsToInvalid: boolean
  /** The preview the message is about: when it changes the message goes. null until anchored */
  readonly anchor: string | null
}

type State =
  | { readonly phase: "idle" }
  | { readonly phase: "rereading"; readonly after: Shown }
  | { readonly phase: "rereadFailed"; readonly after: Shown }
  | { readonly phase: "shown"; readonly shown: Shown }

const idle: State = { phase: "idle" }

/**
 * A key of the admin's choices in a split: the division, who is chosen and
 * «Quanti» when written. A re-read that only changes the numbers keeps it
 */
export const choicesKey = (split: Split) =>
  JSON.stringify({
    strategy: split.strategy,
    chosen: [...split.chosen].sort((a, b) => a - b),
    count: split.countBelowMax ? split.countText : null,
  })

/**
 * The outcomes of a confirmation of the page of a Wave (AC16, D4, D17, D18),
 * for «Assegna» (`useAssignConfirm`) and «Sposta» (T18). The mutation hook
 * takes `callbacks`; the confirmation calls `begin(key, name)` for the
 * `requestId` to send (`null` while a request is in flight), then `mutate`.
 * - `reread` reads the numbers again (the Wave, and for «Sposta» the
 *   candidates too) and says whether it succeeded: `NumbersChanged` and the
 *   uncertain outcome use it, and a failure shows «Riprova» with the
 *   confirmation off until it succeeds.
 * - `notice` is the one message for the summary of the step, `blocked`
 *   whether the confirmation is off because of it. A message stays until the
 *   admin changes a choice (`choices`, `choicesKey`); the session and the
 *   permission stay while the step is open. After a re-read, an invalid
 *   preview says its own message (AC14).
 * - While the page is mounted, success calls `onSuccess`; once the admin left
 *   it the outcome is a toast (D18), with the texts `toasts` gives.
 */
export function useConfirmOutcome<Result>({
  choices,
  preview,
  texts,
  reread,
  onSuccess,
  toasts,
}: {
  choices: string
  preview: Preview
  texts: ConfirmTexts
  reread: () => Promise<boolean>
  onSuccess: (result: Result) => void
  toasts: {
    /** «Assegnati <N> clienti della <nome>» */
    readonly success: (result: Result, name: string) => string
  }
}) {
  const key = choices
  const [state, setState] = useState<State>(idle)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // The request sent last, and the one of an uncertain outcome (D4, D17)
  const sent = useRef<{ key: string; requestId: string; name: string } | null>(
    null
  )
  const uncertain = useRef<{ key: string; requestId: string } | null>(null)
  // A request is in flight: read in the same task as the click, where `pending`
  // of the render is still false (AC15)
  const sending = useRef(false)
  // The latest functions of the page, for the callbacks that run after a render
  const latest = useRef({ reread, onSuccess, toasts, texts })
  latest.current = { reread, onSuccess, toasts, texts }

  // A message is anchored to the choices it is shown on, and goes when they change
  useEffect(() => {
    if (state.phase !== "shown" || state.shown.sticky) return
    const { shown } = state
    if (shown.anchor === null) {
      setState({ phase: "shown", shown: { ...shown, anchor: key } })
    } else if (shown.anchor !== key) setState(idle)
  }, [state, key])

  const runReread = async (after: Shown) => {
    setState({ phase: "rereading", after })
    const ok = await latest.current.reread()
    if (!mounted.current) return
    setState(
      ok ? { phase: "shown", shown: after } : { phase: "rereadFailed", after }
    )
  }

  const message = (
    text: string,
    options: { sticky?: boolean; yieldsToInvalid?: boolean } = {}
  ): Shown => ({
    text,
    sticky: options.sticky ?? false,
    yieldsToInvalid: options.yieldsToInvalid ?? false,
    anchor: null,
  })

  const callbacks: WaveMutationCallbacks<Result, unknown> = {
    onSettled: () => {
      sending.current = false
    },
    onSuccess: (result) => {
      uncertain.current = null
      if (mounted.current) {
        setState(idle)
        latest.current.onSuccess(result)
      } else {
        toast.success(
          latest.current.toasts.success(result, sent.current?.name ?? "")
        )
      }
    },
    onError: (error) => {
      const kind = failureKind(error)
      uncertain.current =
        kind === "uncertain" && sent.current !== null
          ? { key: sent.current.key, requestId: sent.current.requestId }
          : null
      const name = sent.current?.name ?? ""
      if (!mounted.current) {
        if (kind === "uncertain") {
          toast.warning(
            `Non sappiamo se l'operazione sulla ${name} è andata a buon fine: controlla i numeri nella sua pagina.`
          )
        } else toast.error(`La ${name} non è cambiata.`)
        return
      }
      const { texts } = latest.current
      switch (kind) {
        case "numbersChanged":
          return void runReread(
            message(texts.numbersChanged, { yieldsToInvalid: true })
          )
        case "nothingToMove":
          return void runReread(
            message(texts.nothingToMove ?? texts.numbersChanged, {
              yieldsToInvalid: true,
            })
          )
        case "uncertain":
          return void runReread(message(UNCERTAIN))
        case "session":
          return setState({
            phase: "shown",
            shown: message(SESSION, { sticky: true }),
          })
        case "refused":
          return setState({
            phase: "shown",
            shown: message(texts.refused, { sticky: true }),
          })
        case "failed":
          return setState({ phase: "shown", shown: message(FAILED) })
      }
    },
  }

  /**
   * The `requestId` of a confirmation of the request `requestKey` on the Wave
   * `name`: the one of the uncertain outcome for the same request, otherwise
   * a new one (D4, D17)
   */
  const begin = (requestKey: string, name: string): string | null => {
    if (sending.current) return null
    sending.current = true
    const requestId =
      uncertain.current?.key === requestKey
        ? uncertain.current.requestId
        : crypto.randomUUID()
    sent.current = { key: requestKey, requestId, name }
    setState(idle)
    return requestId
  }

  const notice: SplitNotice | null = (() => {
    switch (state.phase) {
      case "idle":
        return null
      case "shown":
        return state.shown.yieldsToInvalid && !preview.ok
          ? null
          : { text: state.shown.text }
      case "rereading":
        return {
          text: state.after.text,
        }
      case "rereadFailed":
        return {
          text: REREAD_FAILED,
          retry: () => void runReread(state.after),
        }
    }
  })()
  const blocked =
    state.phase === "rereading" ||
    state.phase === "rereadFailed" ||
    (state.phase === "shown" && state.shown.sticky)

  return { callbacks, begin, notice, blocked }
}

/**
 * The confirmation of «Assegna» (AC15–AC17): the step with its button, which
 * sends the receivers of the preview to `assign`. «Assegnazione in corso…»
 * while it runs, with the fields still (the flow is `locked` with `pending`).
 * On success the screen at the end goes to `onDone`, with «Assegna i
 * restanti <N>» (`onRest`) when customers are left without an operator and
 * «Vai alla Wave» (`onOverview`)
 */
export function useAssignConfirm({
  id,
  wave,
  split,
  onDone,
  onRest,
  onOverview,
}: {
  id: number
  wave: WaveView
  split: Split
  onDone: (screen: DoneContent) => void
  onRest: () => void
  onOverview: () => void
}): { step: FlowStep; pending: boolean } {
  const queryClient = useQueryClient()
  const outcome = useConfirmOutcome<{ assigned: number; remaining: number }>({
    choices: choicesKey(split),
    preview: split.preview,
    texts: {
      refused: "Solo un admin può assegnare contatti.",
      numbersChanged: NUMBERS_CHANGED,
    },
    reread: () => rereadWave(queryClient, id),
    onSuccess: (result) => {
      // The Wave read again after the assignment, when the reading succeeded
      const fresh =
        queryClient.getQueryState(importKeys.wave(id))?.status === "success"
          ? queryClient.getQueryData<WaveView>(importKeys.wave(id))
          : undefined
      onDone(
        assignDone({
          id,
          wave: fresh ?? wave,
          assigned: result.assigned,
          remaining: fresh?.toAssign ?? result.remaining,
          onRest,
          onOverview,
        })
      )
    },
    toasts: {
      success: (result, name) =>
        `${assignedText(result.assigned)} della ${name}`,
    },
  })
  const assign = useAssign(id, outcome.callbacks)
  const pending = assign.isPending
  const step = splitFlowStep({
    split,
    header: assignHeader(wave),
    verb: "Assegna",
    pending,
    pendingLabel: "Assegnazione in corso…",
    blocked: outcome.blocked,
    notice: outcome.notice,
    onConfirm: (preview) => {
      const receivers = preview.receivers.map(({ operatorId, count }) => ({
        operatorId,
        count,
      }))
      const requestId = outcome.begin(JSON.stringify(receivers), wave.name)
      if (requestId === null) return
      assign.mutate({ requestId, receivers })
    },
  })
  return { step, pending }
}

/** Reads the Wave again and says whether it succeeded (AC16) */
export async function rereadWave(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number
): Promise<boolean> {
  await queryClient.refetchQueries({
    queryKey: importKeys.wave(id),
    exact: true,
  })
  return queryClient.getQueryState(importKeys.wave(id))?.status === "success"
}

/** The screen at the end of an assignment (AC17, AC36) */
function assignDone({
  id,
  wave,
  assigned,
  remaining,
  onRest,
  onOverview,
}: {
  id: number
  wave: WaveView
  assigned: number
  remaining: number
  onRest: () => void
  onOverview: () => void
}): DoneContent {
  const rest =
    remaining > 0 ? ` Restano ${formatNumber(remaining)} senza operatore.` : ""
  return {
    title: `${assignedText(assigned)} della ${wave.name}`,
    text: <AssignDoneText id={id} wave={wave} rest={rest} />,
    actions: (
      <AssignDoneActions
        id={id}
        remaining={remaining}
        onRest={onRest}
        onOverview={onOverview}
      />
    ),
  }
}

/**
 * The text of the screen at the end (AC17, AC36): the deadline as the live
 * Wave has it, so after «Proroga» the sentence of the expired Wave goes
 * (`wave` is the one at the confirmation, until the page has its own)
 */
function AssignDoneText({
  id,
  wave,
  rest,
}: {
  id: number
  wave: WaveView
  rest: string
}) {
  const live = useWave(id).data ?? wave
  const deadline =
    live.deadline === null
      ? ""
      : live.status === "expired"
        ? `La Wave è scaduta il ${dayText(live.deadline)}. `
        : `Scadenza ${dayText(live.deadline)}. `
  return `${deadline}Li trovano in Da chiamare.${rest}`
}

/**
 * The buttons of the screen at the end (AC17): «Assegna i restanti <N>»,
 * «Proroga» on an expired Wave, «Vai alla Wave». «Proroga» reads the Wave of
 * the page, so it saves on the deadline the page has now
 */
function AssignDoneActions({
  id,
  remaining,
  onRest,
  onOverview,
}: {
  id: number
  remaining: number
  onRest: () => void
  onOverview: () => void
}) {
  const wave = useWave(id).data
  const expired = wave?.status === "expired" && wave.deadline !== null
  return (
    <>
      {remaining > 0 ? (
        <Button type="button" onClick={onRest}>
          Assegna i restanti {formatNumber(remaining)}
        </Button>
      ) : null}
      {expired ? (
        <Extend
          id={id}
          wave={wave}
          variant="outline"
          size="default"
          align="center"
        />
      ) : null}
      <Button
        type="button"
        variant={remaining > 0 ? "outline" : "default"}
        onClick={onOverview}
      >
        Vai alla Wave
      </Button>
    </>
  )
}
