import { render, screen } from "@testing-library/react"
import { type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { CircleCard } from "../CircleCard"

// ProgressCircle finto: espone il colore che la card gli passa e mostra la
// percentuale (Recharts e i colori di Tremor non si leggono in jsdom)
vi.mock("@tremor/react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  ProgressCircle: (props: { color: string; children?: ReactNode }) => (
    <div data-testid="progress" data-color={props.color}>
      {props.children}
    </div>
  ),
}))

const renderCard = (done: number, todo: number) => {
  render(<CircleCard done={done} todo={todo} />)
  const progress = screen.getByTestId("progress")
  return { color: progress.dataset.color, shown: progress.textContent }
}

describe("CircleCard: il colore segue la percentuale mostrata (AC22)", () => {
  it("con 26 completati su 100, `CircleCard` è gialla", () => {
    expect(renderCard(26, 74)).toEqual({ color: "yellow", shown: "26%" })
  })

  it.each([
    { done: 0, todo: 0, shown: "0%", color: "red" },
    { done: 25, todo: 75, shown: "25%", color: "red" },
    { done: 26, todo: 74, shown: "26%", color: "yellow" },
    { done: 50, todo: 50, shown: "50%", color: "yellow" },
    { done: 51, todo: 49, shown: "51%", color: "blue" },
    { done: 76, todo: 24, shown: "76%", color: "green" },
    // 75,4% si mostra 75%: blu, non verde
    { done: 754, todo: 246, shown: "75%", color: "blue" },
    // 75,6% si mostra 76%: verde
    { done: 756, todo: 244, shown: "76%", color: "green" },
  ])(
    "con $done completati e $todo da fare mostra $shown ed è $color",
    ({ done, todo, shown, color }) => {
      expect(renderCard(done, todo)).toEqual({ color, shown })
    }
  )
})

describe("CircleCard: il testo accanto all'anello", () => {
  it("mostra la stessa percentuale arrotondata dell'anello", () => {
    render(<CircleCard done={756} todo={244} />)
    expect(screen.getByText("756/1000 (76%)")).toBeTruthy()
  })
})
