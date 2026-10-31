import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { globalsSonnerRules } from "@/test/toast"
import { Alert, AlertDescription, AlertTitle } from "../alert"
import { Avatar, AvatarFallback } from "../avatar"

// Avvisi, toast e avatar della spec design-system-web (AC18, AC19, appendice B)
const has = (el: Element | null, ...expected: string[]) =>
  expect((el?.getAttribute("class") ?? "").split(/\s+/)).toEqual(
    expect.arrayContaining(expected)
  )

describe("Alert", () => {
  it("il neutro è su card, border e foreground", () => {
    render(
      <Alert>
        <AlertTitle>Nota</AlertTitle>
      </Alert>
    )
    has(
      screen.getByRole("alert"),
      "bg-card",
      "border-border",
      "text-foreground"
    )
  })

  it("il distruttivo usa la terna destructive-soft", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Errore</AlertTitle>
        <AlertDescription>Riprova</AlertDescription>
      </Alert>
    )
    has(
      screen.getByRole("alert"),
      "bg-destructive-soft",
      "border-destructive-soft-border",
      "text-destructive-soft-foreground"
    )
  })
})

// The toasts are Sonner's (spec toast-sonner, AC4): their colours are Sonner's
// variables, set from the tokens in an unlayered block of globals.css. jsdom
// doesn't load it, so the block is read as text; the computed colours, the
// radius and the shadow of Sonner (AC7) are read in the browser
describe("toast", () => {
  const colorsOf = (type: string | null) => {
    const rules = globalsSonnerRules.filter(({ selector }) =>
      type === null
        ? !selector.includes("data-type")
        : selector.endsWith(`[data-type="${type}"]`)
    )
    return Object.fromEntries(
      rules.flatMap(({ declarations }) =>
        [...declarations].filter(([name]) => name.startsWith("--normal-"))
      )
    )
  }

  it.each([
    ["success", "success-soft"],
    ["error", "destructive-soft"],
    ["info", "primary-soft"],
  ] as const)("il tipo %s usa la terna %s", (type, soft) => {
    expect(colorsOf(type)).toEqual({
      "--normal-bg": `var(--color-${soft})`,
      "--normal-border": `var(--color-${soft}-border)`,
      "--normal-text": `var(--color-${soft}-foreground)`,
    })
  })

  it("il neutro è su card con bordo border e testo foreground", () => {
    expect(colorsOf(null)).toEqual({
      "--normal-bg": "var(--color-card)",
      "--normal-border": "var(--color-border)",
      "--normal-text": "var(--color-foreground)",
    })
  })

  // The colour gate takes every custom property of globals.css for a token
  // definition: the variables of Sonner are checked here instead
  it("ogni variabile di colore di Sonner viene da un token", () => {
    const values = globalsSonnerRules.flatMap(({ declarations }) =>
      [...declarations]
        .filter(([name]) =>
          /^--(normal|success|error|info|warning)-/.test(name)
        )
        .map(([, value]) => value)
    )
    expect(values).not.toHaveLength(0)
    for (const value of values) expect(value).toMatch(/^var\(--color-[\w-]+\)$/)
  })
})

describe("Avatar", () => {
  it("il segnaposto ha il tono neutral", () => {
    render(
      <Avatar>
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
    )
    has(screen.getByText("MR"), "bg-tag-neutral-bg", "text-tag-neutral-text")
  })
})
