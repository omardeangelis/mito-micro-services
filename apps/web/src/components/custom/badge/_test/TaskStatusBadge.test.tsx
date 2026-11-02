import { render, screen } from "@testing-library/react"
import { allStates, stateLabel } from "@mito/domain/contact/status"
import { describe, expect, it } from "vitest"
import { stateTone } from "@/lib/tones"
import { TaskStatusBadge } from "../TaskStatusBadge"

// Lo stato del contatto col suo tono, uno per stato (AC16, appendice B della
// spec design-system-web)
describe("TaskStatusBadge", () => {
  it("followup ha il tono del suo stato nuovo, la misura di AC16 e la pillola", () => {
    render(<TaskStatusBadge status="followup" />)
    const badge = screen.getByText("Da chiamare")
    expect(badge.className.split(" ")).toEqual(
      expect.arrayContaining([
        "bg-tag-blue-bg",
        "border-tag-blue-border",
        "text-tag-blue-text",
        "rounded-full",
        "text-xs",
        "font-label",
      ])
    )
    expect(badge.className).toMatch(/(^| )h-(5\.5|\[22px\])( |$)/)
    expect(badge.className).not.toContain("text-xxs")
  })

  it.each(allStates)("%s ha il fondo del suo tono", (state) => {
    render(<TaskStatusBadge status={state} />)
    expect(screen.getByText(stateLabel(state)).className).toContain(
      `bg-tag-${stateTone(state)}-bg`
    )
  })

  it("app.to si legge Appuntamento, mai il valore del database", () => {
    render(<TaskStatusBadge status="app.to" />)

    expect(screen.getByText("Appuntamento")).toBeTruthy()
    expect(screen.queryByText("app.to")).toBeNull()
  })

  it("un valore vecchio si legge con l'etichetta del suo stato nuovo (AC30)", () => {
    render(<TaskStatusBadge status="followup" />)

    expect(screen.getByText("Da chiamare")).toBeTruthy()
    expect(screen.queryByText("followup")).toBeNull()
  })

  it("erogata si legge Pratica caricata", () => {
    render(<TaskStatusBadge status="erogata" />)

    expect(screen.getByText("Pratica caricata")).toBeTruthy()
    expect(screen.queryByText("erogata")).toBeNull()
  })

  it("richiamare con il giorno dell'alert aperto si legge Richiamo · gg/mm (AC1)", () => {
    render(<TaskStatusBadge status="richiamare" alertDay="2026-11-05" />)

    expect(screen.getByText("Richiamo · 05/11")).toBeTruthy()
  })

  it("richiamare senza alert si legge Richiamo, senza giorno (AC30)", () => {
    render(<TaskStatusBadge status="richiamare" alertDay={null} />)

    expect(screen.getByText("Richiamo")).toBeTruthy()
  })
})
