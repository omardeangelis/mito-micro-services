import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "../badge"

// Il Badge con i toni dell'appendice B (AC16) e le varianti di prima sui toni
describe("Badge", () => {
  it("con tone ha i token del tono, la misura di AC16 e la pillola", () => {
    render(<Badge tone="amber">Richiamare</Badge>)
    const badge = screen.getByText("Richiamare")
    expect(badge.className.split(" ")).toEqual(
      expect.arrayContaining([
        "bg-tag-amber-bg",
        "border-tag-amber-border",
        "text-tag-amber-text",
        "rounded-full",
        "border",
        "text-xs",
        "font-label",
      ])
    )
    // 22 px
    expect(badge.className).toMatch(/(^| )h-(5\.5|\[22px\])( |$)/)
  })

  it("con tone tiene la misura di AC16 anche se gli si passa size", () => {
    render(
      <Badge tone="blue" size="xs">
        Chiamare
      </Badge>
    )
    const classes = screen.getByText("Chiamare").className.split(" ")
    expect(classes).toContain("text-xs")
    expect(classes).not.toContain("text-xxs")
  })

  it.each([
    ["default", "neutral"],
    ["secondary", "neutral"],
    ["success", "green"],
    ["warning", "amber"],
    ["destructive", "red"],
  ] as const)("la variante %s usa il tono %s", (variant, tone) => {
    render(<Badge variant={variant}>{variant}</Badge>)
    expect(screen.getByText(variant).className).toContain(`bg-tag-${tone}-bg`)
  })

  it("la variante outline è su card con bordo border-strong", () => {
    render(<Badge variant="outline">Ruolo</Badge>)
    expect(screen.getByText("Ruolo").className.split(" ")).toEqual(
      expect.arrayContaining([
        "bg-card",
        "border-border-strong",
        "text-foreground",
      ])
    )
  })
})
