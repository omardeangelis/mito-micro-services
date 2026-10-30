import { render, screen } from "@testing-library/react"
import { allStates } from "@mito/domain/contact/status"
import { describe, expect, it } from "vitest"
import { stateTone } from "@/lib/tones"
import { TaskStatusBadge } from "../TaskStatusBadge"

// Lo stato del contatto col suo tono, uno per stato (AC16, appendice B della
// spec design-system-web)
describe("TaskStatusBadge", () => {
  it("followup ha il tono magenta, la misura di AC16 e la pillola", () => {
    render(<TaskStatusBadge status="followup" />)
    const badge = screen.getByText("followup")
    expect(badge.className.split(" ")).toEqual(
      expect.arrayContaining([
        "bg-tag-magenta-bg",
        "border-tag-magenta-border",
        "text-tag-magenta-text",
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
    expect(screen.getByText(state).className).toContain(
      `bg-tag-${stateTone(state)}-bg`
    )
  })
})
