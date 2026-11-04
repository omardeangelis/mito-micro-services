import { useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { type MoveResult } from "@mito/contract/import"
import { importKeys, useMove, useWave, type WaveView } from "@/api/import"
import { Button } from "@/components/ui/button"
import {
  choicesKey,
  NUMBERS_CHANGED,
  rereadWave,
  useConfirmOutcome,
} from "../AssignConfirm"
import { type DoneContent } from "../_lib/mode"
import { movedText, notMovedText, operatorsText } from "../_lib/text"
import { Extend } from "../Extend"
import { type Split } from "../split/SplitStep"
import { type MoveConfirmation } from "./MoveFlow"

const NOTHING_TO_MOVE =
  "Nessuno dei contatti scelti si può più spostare: nel frattempo hanno avuto un esito o sono passati a un altro operatore."

/**
 * The confirmation of «Sposta» (AC26, AC27): the outcomes of AC16 with the
 * texts of the reassignment. Every re-read (numbers changed, `NothingToMove`,
 * uncertain outcome) reads the Wave and the candidates again, and the next
 * confirmation sends the ids of the new candidates (D7). «Spostamento in
 * corso…» while it runs. On success the screen at the end goes to `onDone`,
 * with «Vai alla Wave» (`onOverview`)
 * - `selection` is a key of what «Quali e quanti contatti» chose: a message
 *   goes when it changes
 * - `from` is the «<nomi propri>» of who gives
 */
export function useMoveConfirm({
  id,
  wave,
  split,
  selection,
  from,
  onDone,
  onOverview,
}: {
  id: number
  wave: WaveView
  split: Split
  selection: string
  from: string
  onDone: (screen: DoneContent) => void
  onOverview: () => void
}) {
  const queryClient = useQueryClient()
  // The confirmation sent last: its re-read of the candidates is the one to use
  const sent = useRef<MoveConfirmation | null>(null)
  const outcome = useConfirmOutcome<MoveResult>({
    choices: `${choicesKey(split)}|${selection}`,
    preview: split.preview,
    texts: {
      refused: "Solo un admin può spostare contatti.",
      numbersChanged: NUMBERS_CHANGED,
      nothingToMove: NOTHING_TO_MOVE,
    },
    reread: async () => {
      const [waveRead, candidatesRead] = await Promise.all([
        rereadWave(queryClient, id),
        sent.current?.rereadCandidates() ?? Promise.resolve(true),
      ])
      return waveRead && candidatesRead
    },
    onSuccess: (result) => {
      // The Wave read again after the move, when the reading succeeded
      const fresh =
        queryClient.getQueryState(importKeys.wave(id))?.status === "success"
          ? queryClient.getQueryData<WaveView>(importKeys.wave(id))
          : undefined
      onDone(
        moveDone({
          id,
          wave: fresh ?? wave,
          result,
          from,
          receivers: sent.current?.request.receivers.length ?? 0,
          onOverview,
        })
      )
    },
    toasts: {
      success: (result, name) => `${movedText(result.moved)} della ${name}`,
    },
  })
  const move = useMove(id, outcome.callbacks)
  return {
    pending: move.isPending,
    pendingLabel: "Spostamento in corso…",
    blocked: outcome.blocked,
    notice: outcome.notice,
    confirm: (confirmation: MoveConfirmation) => {
      const requestId = outcome.begin(
        JSON.stringify(confirmation.request),
        wave.name
      )
      if (requestId === null) return
      sent.current = confirmation
      move.mutate({ requestId, ...confirmation.request })
    },
  }
}

/** The screen at the end of a move (AC27, AC36) */
function moveDone({
  id,
  wave,
  result,
  from,
  receivers,
  onOverview,
}: {
  id: number
  wave: WaveView
  result: MoveResult
  from: string
  receivers: number
  onOverview: () => void
}): DoneContent {
  const skipped =
    result.skipped > 0
      ? ` ${notMovedText(result.skipped)}: nel frattempo hanno avuto un esito o sono passati a un altro operatore.`
      : ""
  return {
    title: movedText(result.moved),
    text: (
      <MoveDoneText
        id={id}
        wave={wave}
        text={`Da ${from} a ${operatorsText(receivers)}. Stato, alert e chat restano come sono.${skipped}`}
      />
    ),
    actions: <MoveDoneActions id={id} onOverview={onOverview} />,
  }
}

/**
 * The text of the screen at the end (AC27): «La Wave resta scaduta…» only
 * while the live Wave is expired, so it goes after «Proroga» (`wave` is the
 * one at the move, until the page has its own)
 */
function MoveDoneText({
  id,
  wave,
  text,
}: {
  id: number
  wave: WaveView
  text: string
}) {
  const live = useWave(id).data ?? wave
  const expired = live.status === "expired" && live.deadline !== null
  return expired
    ? `${text} La Wave resta scaduta: spostare non cambia la scadenza.`
    : text
}

/**
 * The buttons of the screen at the end (AC27): «Proroga» on an expired Wave,
 * «Vai alla Wave». «Proroga» reads the Wave of the page, so it saves on the
 * deadline the page has now
 */
function MoveDoneActions({
  id,
  onOverview,
}: {
  id: number
  onOverview: () => void
}) {
  const wave = useWave(id).data
  const expired = wave?.status === "expired" && wave.deadline !== null
  return (
    <>
      {expired ? (
        <Extend
          id={id}
          wave={wave}
          variant="outline"
          size="default"
          align="center"
        />
      ) : null}
      <Button type="button" onClick={onOverview}>
        Vai alla Wave
      </Button>
    </>
  )
}
