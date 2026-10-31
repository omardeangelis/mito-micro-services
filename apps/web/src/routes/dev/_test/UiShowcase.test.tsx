import { act, render, screen, waitFor, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { Toaster } from "@/components/ui/sonner"
import { UiShowcase } from "../UiShowcase"

// The test page /_dev/ui of the spec design-system-web (AC22): what it shows,
// so the browser check of every token and component has a page to read

// jsdom measures nothing: this observer gives the charts a size
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 320, height: 200 },
            } as unknown as ResizeObserverEntry,
          ],
          this
        )
      }
      unobserve = () => undefined
      disconnect = () => undefined
    }
  )
})

const renderPage = () =>
  render(
    <>
      <UiShowcase />
      <Toaster />
    </>
  )

const tones = [
  "blue",
  "indigo",
  "magenta",
  "orange",
  "amber",
  "teal",
  "green",
  "red",
  "neutral",
]

// The tokens of appendix A, then the 36 of appendix B
const tokens = [
  "background",
  "card",
  "popover",
  "foreground",
  "card-foreground",
  "popover-foreground",
  "secondary-foreground",
  "accent-foreground",
  "muted",
  "secondary",
  "muted-foreground",
  "subtle",
  "accent",
  "primary",
  "primary-hover",
  "primary-foreground",
  "primary-soft",
  "primary-soft-border",
  "primary-soft-foreground",
  "link",
  "ring",
  "ring-soft",
  "success",
  "success-soft",
  "success-soft-border",
  "success-soft-foreground",
  "warning",
  "warning-soft",
  "warning-soft-border",
  "warning-soft-foreground",
  "destructive",
  "destructive-hover",
  "destructive-foreground",
  "destructive-text",
  "destructive-ring",
  "destructive-soft",
  "destructive-soft-border",
  "destructive-soft-foreground",
  "border",
  "border-strong",
  "input",
  "input-hover",
  "control",
  "tooltip",
  "tooltip-foreground",
  "sidebar",
  "sidebar-foreground",
  "sidebar-muted",
  "sidebar-accent",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "chart-1",
  "chart-1-soft",
  "overlay",
  ...tones.flatMap((tone) =>
    ["bg", "border", "text", "dot"].map((part) => `tag-${tone}-${part}`)
  ),
]

describe("UiShowcase", () => {
  it("mostra il campione di ogni token col suo nome", () => {
    renderPage()
    const section = screen
      .getByRole("heading", { name: "Token" })
      .closest("section")!
    for (const token of tokens) {
      expect(
        within(section).getAllByText(token, { exact: true }).length
      ).toBeGreaterThan(0)
    }
  })

  it("mostra un badge per tono, gli stati, la blacklist, gli import e la priorità nei quattro livelli", () => {
    const { container } = renderPage()
    for (const tone of tones) {
      expect(container.querySelector(`.bg-tag-${tone}-bg`)).not.toBeNull()
    }
    for (const label of [
      "chiamare",
      "followup",
      "non risponde",
      "richiamare",
      "app.to",
      "caricato",
      "erogata",
      "non interessato",
      "nessuno",
      "In corso",
      "Completato",
      "Fallito",
      "Interrotto",
    ]) {
      expect(screen.getAllByText(label, { exact: true }).length).toBe(1)
    }
    // La blacklist è un'icona, col tono nel suo riempimento
    for (const tone of ["red", "amber", "green"]) {
      expect(
        container.querySelector(`svg.fill-tag-${tone}-text`)
      ).not.toBeNull()
    }
    for (const level of ["1", "2", "3", "4"]) {
      expect(container.querySelector(`[data-level="${level}"]`)).not.toBeNull()
    }
  })

  it("mostra ogni variante e taglia di Button", () => {
    const { container } = renderPage()
    for (const variant of [
      "default",
      "outline",
      "secondary",
      "ghost",
      "destructive",
      "link",
      "disabled",
    ]) {
      expect(
        container.querySelector(`button[data-variant="${variant}"]`)
      ).not.toBeNull()
    }
    for (const size of [
      "default",
      "xs",
      "sm",
      "lg",
      "icon",
      "icon-xs",
      "icon-sm",
      "icon-lg",
    ]) {
      expect(
        container.querySelector(`button[data-size="${size}"]`)
      ).not.toBeNull()
    }
  })

  it("mostra un campo in ogni stato di AC11", () => {
    const { container } = renderPage()
    const inputs = [...container.querySelectorAll("input[data-slot=input]")]
    expect(inputs.some((i) => i.getAttribute("aria-invalid") === "true")).toBe(
      true
    )
    expect(inputs.some((i) => i.hasAttribute("disabled"))).toBe(true)
    const classes = inputs.map((i) => i.className.split(/\s+/))
    expect(classes.some((c) => c.includes("border-input-hover"))).toBe(true)
    expect(
      classes.some(
        (c) => c.includes("border-ring") && c.includes("ring-ring-soft")
      )
    ).toBe(true)
  })

  it("mostra checkbox, radio e switch accesi e spenti", () => {
    const { container } = renderPage()
    for (const control of [
      '[data-slot="checkbox"]',
      '[data-slot="switch"]',
      '[data-slot="radio-group-item"]',
    ]) {
      expect(
        container.querySelector(`${control}[data-state="checked"]`)
      ).not.toBeNull()
      expect(
        container.querySelector(`${control}[data-state="unchecked"]`)
      ).not.toBeNull()
    }
  })

  it("mostra una tabella con una riga selezionata e la Pagination con la pagina corrente", () => {
    const { container } = renderPage()
    expect(container.querySelector('tr[data-state="selected"]')).not.toBeNull()
    expect(
      container.querySelector(
        '[data-slot="pagination-link"][aria-current="page"]'
      )
    ).not.toBeNull()
  })

  it("mostra un avviso per ogni variante e apre un toast per ogni tipo (AC3, AC11, AC29)", async () => {
    const { container } = renderPage()
    for (const surface of [
      "bg-card",
      "bg-success-soft",
      "bg-primary-soft",
      "bg-destructive-soft",
    ]) {
      expect(
        screen
          .getAllByRole("alert")
          .some((alert) => alert.className.split(/\s+/).includes(surface))
      ).toBe(true)
    }
    // One button per type; the toasts pile up, each with its type (the
    // colour is read in the browser, T10)
    const buttons = screen.getAllByRole("button", { name: /^Toast/ })
    expect(buttons).toHaveLength(4)
    for (const button of buttons) act(() => button.click())
    await waitFor(() =>
      expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(4)
    )
    const types = [...document.querySelectorAll("[data-sonner-toast]")].map(
      (node) => node.getAttribute("data-type")
    )
    expect(types.sort()).toEqual(["error", "info", "success", null].sort())
    expect(container.querySelector(".recharts-surface")).not.toBeNull()
  })
})
