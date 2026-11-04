import { useMemo, useRef, useState } from "react"
import { type MoveCandidates, type MoveInput } from "@mito/contract/import"
import { useMoveCandidates, type WaveView } from "@/api/import"
import { type DoneContent } from "../_lib/mode"
import { Flow, type FlowStep } from "../Flow"
import { formatNumber, properNames } from "../_lib/text"
import { splitFlowStep, useSplit, type Preview } from "../split/SplitStep"
import { isInactive } from "../split/_lib/preview"
import { FromStep, fromGroups } from "./FromStep"
import { useMoveConfirm } from "./MoveConfirm"
import { WhichStep, type CandidatesStatus } from "./WhichStep"
import {
  defaultWhich,
  giversOf,
  selectionOf,
  whichCounts,
  type HowMany,
  type Selection,
  type Which,
} from "./_lib/selection"

/** What «Sposta» sends to `move`, without its `requestId` (D6, D7) */
export type MoveRequest = Omit<MoveInput, "requestId">

/**
 * The confirmation of «A chi» (`useMoveConfirm`): the request of the preview
 * confirmed, the preview itself, and the re-read of the candidates, which
 * says whether it succeeded. A re-read keeps the choices of the steps
 * and recomputes the «Da spostare» on the new snapshot (D7)
 */
export type MoveConfirmation = {
  readonly request: MoveRequest
  readonly preview: Extract<Preview, { ok: true }>
  readonly rereadCandidates: () => Promise<boolean>
}

/** The candidates of the givers committed with «Avanti» (D7) */
type Snapshot =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready"
      readonly candidates: MoveCandidates["candidates"]
    }

/** The choices of «Quali e quanti contatti»: `which` null is the default */
type WhichChoice = {
  readonly which: Which | null
  readonly howMany: HowMany
  /** The field, null while it follows its maximum */
  readonly written: string | null
}

const openChoice: WhichChoice = { which: null, howMany: "all", written: null }

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * «Riassegna» (AC22–AC25, D7): «Da chi», «Quali e quanti contatti» and «A
 * chi», with «Annulla» to the overview.
 * - «Da chi» opens with `from` chosen (AC22).
 * - Its «Avanti» asks for the candidates of who is chosen and goes on at
 *   once. The second step reads only them: while they arrive its cards show
 *   the skeleton, and if they fail «Riprova» asks again. Its choices open
 *   again when the givers change.
 * - «A chi» divides the contacts to move among the team without who gives;
 *   its choices open again when the givers change.
 * The step open is the page's (`at`, `onGo`). «Sposta» confirms (T18), and
 * its screen at the end goes to `onDone`
 */
export function MoveFlow({
  id,
  wave,
  from,
  at,
  onGo,
  onCancel,
  onDone,
}: {
  id: number
  wave: WaveView
  /** Chosen when it opens */
  from: readonly number[]
  at: number
  onGo: (at: number) => void
  onCancel: () => void
  onDone: (screen: DoneContent) => void
}) {
  const groups = useMemo(() => fromGroups(wave.team), [wave.team])
  const listed = groups.flatMap((group) => group.people)
  const byOperator = useMemo(
    () => new Map(wave.team.map((person) => [person.operatorId, person])),
    [wave.team]
  )

  // «Da chi»: who is chosen now, and the givers committed with «Avanti»
  const [chosenNow, setChosen] = useState<readonly number[]>(from)
  const chosen = listed
    .map((person) => person.operatorId)
    .filter((operatorId) => chosenNow.includes(operatorId))
  const [givers, setGivers] = useState<readonly number[]>([])

  // The snapshot of the candidates (D7); a late answer of an older ask is dropped
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading" })
  const candidates = useMoveCandidates(id)
  const asked = useRef(0)
  const read = (of: readonly number[], keep: boolean) => {
    const n = ++asked.current
    if (!keep) setSnapshot({ status: "loading" })
    return candidates.mutateAsync({ from: of }).then(
      (result) => {
        if (n === asked.current)
          setSnapshot({ status: "ready", candidates: result.candidates })
        return true
      },
      () => {
        if (n === asked.current && !keep) setSnapshot({ status: "failed" })
        return false
      }
    )
  }

  const [choice, setChoice] = useState<WhichChoice>(openChoice)

  const toWhich = () => {
    if (!sameSet(chosen, givers)) setChoice(openChoice)
    setGivers(chosen)
    void read(chosen, false)
    onGo(1)
  }

  const people = giversOf(
    givers,
    snapshot.status === "ready" ? snapshot.candidates : [],
    byOperator
  )
  const counts = whichCounts(people)
  const which = choice.which ?? defaultWhich(counts)
  // Only «Lo stesso numero per operatore» needs more than one giver
  const howMany =
    choice.howMany === "each" && people.length < 2 ? "all" : choice.howMany
  const selection = selectionOf({
    givers: people,
    which,
    howMany,
    written: choice.written,
  })

  const fromStep: FlowStep = {
    id: "from",
    title: "Da chi",
    body: (
      <FromStep
        groups={groups}
        chosen={chosen}
        onToggle={(operatorId) =>
          setChosen((now) =>
            now.includes(operatorId)
              ? now.filter((other) => other !== operatorId)
              : [...now, operatorId]
          )
        }
        onChooseInactive={() =>
          setChosen((now) => [
            ...new Set([
              ...now,
              ...listed.filter(isInactive).map((person) => person.operatorId),
            ]),
          ])
        }
        onNone={() => setChosen([])}
      />
    ),
    action: {
      label: "Avanti",
      disabled: chosen.length === 0,
      onClick: toWhich,
    },
  }

  const status: CandidatesStatus = snapshot.status
  const whichStep: FlowStep = {
    id: "which",
    title: "Quali e quanti contatti",
    body: (
      <WhichStep
        status={status}
        onRetry={() => void read(givers, false)}
        counts={counts}
        which={which}
        onWhich={(next) =>
          setChoice((now) => ({ ...now, which: next, written: null }))
        }
        howMany={howMany}
        onHowMany={(next) =>
          setChoice((now) => ({ ...now, howMany: next, written: null }))
        }
        givers={people.length}
        selection={selection}
        onWrite={(text) => setChoice((now) => ({ ...now, written: text }))}
      />
    ),
    action: {
      label: "Avanti",
      disabled: status !== "ready" || !selection.valid || selection.total < 1,
      onClick: () => onGo(2),
    },
  }

  return (
    <ToFlow
      // «A chi» opens again, without who gives, when the givers change
      key={givers.join(",")}
      id={id}
      wave={wave}
      givers={givers}
      selection={selection}
      steps={[fromStep, whichStep]}
      at={at}
      onGo={onGo}
      onCancel={onCancel}
      onDone={onDone}
      request={(preview) => ({
        request: {
          which,
          strategy: preview.strategy,
          contacts: selection.contacts,
          receivers: preview.receivers,
        },
        preview,
        rereadCandidates: () => read(givers, true),
      })}
    />
  )
}

/**
 * The flow with «A chi» (AC25): the line «<N> da spostare da <nomi
 * propri>», then the split of «Assegna» without who gives, without «Quanti»,
 * with the messages of the reassignment, and «Sposta <N> a <K> operatori»
 */
function ToFlow({
  id,
  wave,
  givers,
  selection,
  steps,
  at,
  onGo,
  onCancel,
  onDone,
  request,
}: {
  id: number
  wave: WaveView
  givers: readonly number[]
  selection: Selection
  steps: readonly FlowStep[]
  at: number
  onGo: (at: number) => void
  onCancel: () => void
  onDone: (screen: DoneContent) => void
  request: (preview: Extract<Preview, { ok: true }>) => MoveConfirmation
}) {
  const split = useSplit({
    team: wave.team,
    max: selection.total,
    workdays: wave.workdaysLeft,
    excluded: givers,
    withCount: false,
    messages: "reassign",
  })
  const giving = selection.rows.filter((row) => (row.take ?? 0) > 0)
  const from = properNames(
    (giving.length > 0 ? giving : selection.rows).map((row) => row.name)
  )
  const confirm = useMoveConfirm({
    id,
    wave,
    split,
    selection: `${selection.total}:${selection.rows.map((row) => row.take).join(",")}`,
    from,
    onDone,
    onOverview: onCancel,
  })
  const header = (
    <>
      <span className="font-label">
        {formatNumber(selection.total)} da spostare
      </span>{" "}
      <span className="text-muted-foreground">da {from}</span>
    </>
  )
  const toStep = splitFlowStep({
    id: "to",
    title: "A chi",
    split,
    header,
    verb: "Sposta",
    pending: confirm.pending,
    pendingLabel: confirm.pendingLabel,
    blocked: confirm.blocked,
    notice: confirm.notice,
    onConfirm: (preview) => confirm.confirm(request(preview)),
  })
  return (
    <Flow
      title="Riassegna"
      steps={[...steps, toStep]}
      at={at}
      onGo={onGo}
      onCancel={onCancel}
      locked={confirm.pending}
    />
  )
}
