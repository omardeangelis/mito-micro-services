import { render, screen } from "@testing-library/react"
import { type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { FinanceCard } from "../FinanceCard"

// BadgeDelta e DeltaBar finti: espongono l'indicatore e il valore della barra
vi.mock("@tremor/react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  BadgeDelta: (props: { deltaType: string; children?: ReactNode }) => (
    <span data-testid="badge" data-delta-type={props.deltaType}>
      {props.children}
    </span>
  ),
  DeltaBar: (props: { value: number }) => (
    <div data-testid="delta-bar" data-value={props.value} />
  ),
}))

const windows = {
  comparison: {
    start: new Date("2026-01-10T12:00:00Z"),
    end: new Date("2026-02-10T12:00:00Z"),
  },
  reference: {
    start: new Date("2026-02-10T12:00:00Z"),
    end: new Date("2026-03-12T12:00:00Z"),
  },
}

const renderCard = (reference: number, comparison: number) => {
  render(
    <FinanceCard
      title="Finanziato totale"
      referencePeriod={{ total: reference }}
      comparisonPeriod={{ total: comparison }}
      windows={windows}
    />
  )
  const badge = screen.getByTestId("badge")
  return {
    badge: badge.textContent,
    deltaType: badge.dataset.deltaType,
    bar: screen.getByTestId("delta-bar").dataset.value,
  }
}

describe("FinanceCard: la variazione con un confronto a 0 (AC21)", () => {
  it("con un riferimento di 150 000 e un confronto a 0, il badge mostra `—` con l'indicatore `unchanged`", () => {
    expect(renderCard(150_000, 0)).toEqual({
      badge: "—",
      deltaType: "unchanged",
      bar: "0",
    })
  })

  it("con riferimento e confronto a 0, il badge mostra `0%` con l'indicatore `unchanged`", () => {
    expect(renderCard(0, 0)).toEqual({
      badge: "0%",
      deltaType: "unchanged",
      bar: "0",
    })
  })
})

describe("FinanceCard: la variazione con un confronto maggiore di 0", () => {
  it("da 100 a 150 mostra `50%` in aumento", () => {
    expect(renderCard(150, 100)).toEqual({
      badge: "50%",
      deltaType: "increase",
      bar: "50",
    })
  })

  it("da 100 a 50 mostra `-50%` in calo", () => {
    expect(renderCard(50, 100)).toEqual({
      badge: "-50%",
      deltaType: "decrease",
      bar: "-50",
    })
  })
})
