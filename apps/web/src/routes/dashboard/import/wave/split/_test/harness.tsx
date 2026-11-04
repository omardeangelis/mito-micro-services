import { render } from "@testing-library/react"
import { vi } from "vitest"
import { type WaveView } from "@/api/import"
import { Flow } from "../../Flow"
import {
  assignHeader,
  splitFlowStep,
  useSplit,
  type SplitOptions,
} from "../SplitStep"

type Member = WaveView["team"][number]

/** A person of the team, active, with what the test says */
export const member = (
  operatorId: number,
  name: string,
  overrides: Partial<Member> = {}
): Member => ({
  operatorId,
  name,
  role: "OPERATORE",
  shown: true,
  pace: 0,
  exactPace: 0,
  inactiveDays: null,
  active: 0,
  waveTodo: { toCall: 0, noAnswer: 0 },
  ...overrides,
})

function Harness({
  wave,
  options,
  onConfirm,
}: {
  wave: WaveView
  options: Partial<SplitOptions>
  onConfirm: (preview: unknown) => void
}) {
  const split = useSplit({
    team: wave.team,
    max: wave.toAssign,
    workdays: wave.workdaysLeft,
    ...options,
  })
  return (
    <Flow
      title="Assegna i restanti"
      steps={[
        splitFlowStep({
          split,
          header: assignHeader(wave),
          verb: "Assegna",
          onConfirm,
        }),
      ]}
      at={0}
      onGo={() => undefined}
      onCancel={() => undefined}
    />
  )
}

/** The step «Assegna» alone on `wave`, as «Assegna i restanti» shows it */
export function renderSplit(
  wave: WaveView,
  options: Partial<SplitOptions> = {}
) {
  const onConfirm = vi.fn()
  return {
    onConfirm,
    ...render(<Harness wave={wave} options={options} onConfirm={onConfirm} />),
  }
}
