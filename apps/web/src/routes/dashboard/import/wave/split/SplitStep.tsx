import { useMemo, useState, type ReactNode } from "react"
import { type WaveView } from "@/api/import"
import { parseCount } from "@mito/domain/wave/count"
import { type FlowStep } from "../Flow"
import { dayText, formatNumber, toAssignText } from "../_lib/text"
import {
  actionLabel,
  allActive,
  groupsOf,
  initialChoice,
  previewOf,
  type Group,
  type Member,
  type Messages,
  type Preview,
  type Strategy,
} from "./_lib/preview"
import { CountField } from "./CountField"
import { PeopleTable } from "./PeopleTable"
import { StrategyField } from "./StrategyField"
import { SplitSummary, type SplitNotice } from "./SplitSummary"

export type { Preview, Share, Strategy } from "./_lib/preview"
export type { SplitNotice } from "./SplitSummary"

/** What a split works on: «Assegna» (AC10–AC15) or «A chi» of «Riassegna» (AC25) */
export type SplitOptions = {
  team: readonly Member[]
  /** The most to divide: the customers to assign, or the contacts to move */
  max: number
  /** Working days left to the deadline, for «Al giorno»; null for «—» */
  workdays: number | null
  /** The person of a row of the team (`?per`, AC2): the only one chosen */
  per?: number | undefined
  /** Who gives (AC25): not in the list */
  excluded?: readonly number[]
  /** With «Quanti» (AC13); without it the whole `max` is divided */
  withCount?: boolean
  /** The messages of the summary (AC14) */
  messages?: Messages
}

/** The state of a split and what it would do: `useSplit` keeps it */
export type Split = {
  readonly max: number
  readonly workdays: number | null
  readonly withCount: boolean
  readonly groups: readonly Group[]
  readonly chosen: readonly number[]
  readonly strategy: Strategy
  /** What «Quanti» shows */
  readonly countText: string
  /** «Quanti» shows a number that isn't the maximum */
  readonly countBelowMax: boolean
  /** «Quanti» shows its error (AC13) */
  readonly countInvalid: boolean
  readonly preview: Preview
  readonly setStrategy: (strategy: Strategy) => void
  readonly setCount: (text: string) => void
  /** «Tutti»: «Quanti» back to the maximum, following it again */
  readonly countAll: () => void
  readonly toggle: (operatorId: number) => void
  readonly chooseAllActive: () => void
  readonly chooseNone: () => void
}

/**
 * The state of the step «Assegna» (or «A chi» of the reassignment) and its
 * preview. When it opens: «Ritmo» chosen (AC11); every active `OPERATORE` of
 * the list chosen, or the person of `per` alone (AC2, AC12); «Quanti» at the
 * maximum, following it until a number is written, or empty with `per`
 * (AC13). A field changed once is touched (Definizioni)
 */
export function useSplit({
  team,
  max,
  workdays,
  per,
  excluded,
  withCount = true,
  messages = "assign",
}: SplitOptions): Split {
  const groups = useMemo(
    () => groupsOf(team, { per, excluded }),
    [team, per, excluded]
  )
  const [chosen, setChosen] = useState<readonly number[]>(() =>
    initialChoice(groupsOf(team, { per, excluded }), per)
  )
  const [strategy, setStrategyState] = useState<Strategy>("pace")
  // null follows the maximum
  const [written, setWritten] = useState<string | null>(() =>
    per === undefined ? null : ""
  )
  const [touched, setTouched] = useState(false)

  const asked = per !== undefined && !touched
  const count = !withCount
    ? null
    : written === null
      ? ({ ok: true, value: max } as const)
      : parseCount(written, max)
  const preview = previewOf({
    groups,
    // Only who is in the list: a person gone from the team drops out
    chosen,
    strategy,
    max,
    count,
    per,
    touched,
    messages,
  })
  const touch = () => setTouched(true)

  return {
    max,
    workdays,
    withCount,
    groups,
    chosen: chosen.filter((operatorId) =>
      groups.some((group) =>
        group.people.some((person) => person.operatorId === operatorId)
      )
    ),
    strategy,
    countText: written ?? formatNumber(max),
    countBelowMax: count !== null && !(count.ok && count.value === max),
    countInvalid: count !== null && !count.ok && !asked && max > 0,
    preview,
    setStrategy: (next) => {
      touch()
      setStrategyState(next)
    },
    setCount: (text) => {
      touch()
      setWritten(text)
    },
    countAll: () => {
      touch()
      setWritten(null)
    },
    toggle: (operatorId) => {
      touch()
      setChosen((now) =>
        now.includes(operatorId)
          ? now.filter((id) => id !== operatorId)
          : [...now, operatorId]
      )
    },
    chooseAllActive: () => {
      touch()
      setChosen(allActive(groups))
    },
    chooseNone: () => {
      touch()
      setChosen([])
    },
  }
}

/**
 * The line on top of «Assegna» (AC10): «<N> da assegnare con scadenza
 * <giorno>», or «<N> da assegnare · Wave scaduta il <giorno>»
 */
export function assignHeader(
  wave: Pick<WaveView, "toAssign" | "deadline" | "status">
): ReactNode {
  const count = (
    <span className="font-label">{toAssignText(wave.toAssign)}</span>
  )
  if (wave.deadline === null) return count
  if (wave.status === "expired")
    return (
      <>
        {count}{" "}
        <span className="text-destructive-text">
          · Wave scaduta il {dayText(wave.deadline)}
        </span>
      </>
    )
  return (
    <>
      {count} <span className="text-muted-foreground">con scadenza</span>{" "}
      <span className="font-label">{dayText(wave.deadline)}</span>
    </>
  )
}

/**
 * The body of the step (AC10, AC25): the line on top, the card «Come
 * dividere» with «Quanti» and the summary, and the card «A chi». `disabled`
 * stops the fields while a confirmation runs (AC15)
 */
export function SplitStep({
  split,
  header,
  disabled = false,
  notice = null,
}: {
  split: Split
  /** The line on top: `assignHeader`, or «<N> da spostare da <nomi>» */
  header: ReactNode
  disabled?: boolean
  /** The outcome of a confirmation that didn't succeed, in place of the summary (AC16) */
  notice?: SplitNotice | null
}) {
  const shares = new Map(
    split.preview.ok
      ? split.preview.shares.map((share) => [share.operatorId, share.count])
      : []
  )
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{header}</p>
      <section
        aria-label="Come dividere"
        className="rounded-control flex flex-col gap-4 border border-border p-4"
      >
        <StrategyField
          value={split.strategy}
          onChange={split.setStrategy}
          disabled={disabled}
        />
        {split.withCount ? (
          <CountField
            text={split.countText}
            max={split.max}
            atMax={!split.countBelowMax}
            showError={split.countInvalid}
            onChange={split.setCount}
            onAll={split.countAll}
            disabled={disabled}
          />
        ) : null}
        <SplitSummary preview={split.preview} notice={notice} />
      </section>
      <PeopleTable
        groups={split.groups}
        chosen={split.chosen}
        shares={shares}
        workdays={split.workdays}
        onToggle={split.toggle}
        onAllActive={split.chooseAllActive}
        onNone={split.chooseNone}
        disabled={disabled}
      />
    </div>
  )
}

/**
 * The step of a flow for a split: the body, and the button «<verbo> <N> a <K>
 * operatori», active only with a valid preview (AC15). `onConfirm` gets the
 * preview to send. While the confirmation runs (`pending`) the button says
 * `pendingLabel` and the fields are still; `blocked` keeps it off after an
 * outcome of AC16, whose message (`notice`) replaces the summary
 */
export function splitFlowStep({
  id = "assign",
  title = "Assegna",
  split,
  header,
  verb,
  onConfirm,
  disabled = false,
  pending = false,
  pendingLabel,
  blocked = false,
  notice = null,
  message,
}: {
  id?: string
  title?: string
  split: Split
  header: ReactNode
  /** «Assegna», «Sposta» */
  verb: string
  onConfirm: (preview: Extract<Preview, { ok: true }>) => void
  disabled?: boolean
  /** A confirmation is running (AC15) */
  pending?: boolean
  /** «Assegnazione in corso…» */
  pendingLabel?: string
  blocked?: boolean
  notice?: SplitNotice | null
  message?: ReactNode
}): FlowStep {
  const { preview } = split
  return {
    id,
    title,
    body: (
      <SplitStep
        split={split}
        header={header}
        disabled={disabled || pending}
        notice={notice}
      />
    ),
    action: {
      label:
        pending && pendingLabel !== undefined
          ? pendingLabel
          : actionLabel(preview, verb),
      disabled: disabled || pending || blocked || !preview.ok,
      onClick: () => {
        if (preview.ok && !pending && !blocked) onConfirm(preview)
      },
    },
    message,
  }
}
