import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PriorityBadge } from "../priority"

// La priorità a quattro barre della spec design-system-web (AC17): 1 barra
// accesa per Bassa, 4 per Urgente, senza testo nuovo
const bars = (container: HTMLElement) => {
  const scale = container.querySelector("[data-level]")
  return {
    level: scale?.getAttribute("data-level"),
    hidden: scale?.getAttribute("aria-hidden"),
    classes: [...(scale?.children ?? [])].map((bar) =>
      (bar.getAttribute("class") ?? "").split(/\s+/)
    ),
  }
}
const lit = (classes: string[][], token: string) =>
  classes.filter((c) => c.includes(`bg-${token}`)).length

describe("PriorityBadge", () => {
  it("l'urgente ha 4 barre accese in destructive-text e nessun testo", () => {
    const { container } = render(<PriorityBadge priority={150} />)
    const { level, hidden, classes } = bars(container)
    expect(level).toBe("4")
    expect(hidden).toBe("true")
    expect(classes).toHaveLength(4)
    expect(lit(classes, "destructive-text")).toBe(4)
    expect(container.textContent).toBe("")
    expect(container.querySelector("svg.lucide")).toBe(null)
  })

  it.each([
    [20, "1"],
    [60, "2"],
    [100, "3"],
  ])("con priorità %d accende %s barre in muted-foreground", (priority, n) => {
    const { container } = render(<PriorityBadge priority={priority} />)
    const { level, classes } = bars(container)
    expect(level).toBe(n)
    expect(lit(classes, "muted-foreground")).toBe(Number(n))
    expect(lit(classes, "border-strong")).toBe(4 - Number(n))
  })

  it("le barre sono larghe 3 px e alte 4, 7, 10 e 12 px", () => {
    const { container } = render(<PriorityBadge priority={20} />)
    const { classes } = bars(container)
    const px = (prefix: string, value: number) =>
      new RegExp(`^${prefix}-(${value / 4}|\\[${value}px\\])$`)
    classes.forEach((c, i) => {
      expect(c.some((k) => px("w", 3).test(k))).toBe(true)
      expect(c.some((k) => px("h", [4, 7, 10, 12][i]!).test(k))).toBe(true)
    })
  })
})
