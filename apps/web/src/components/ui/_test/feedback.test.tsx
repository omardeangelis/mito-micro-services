import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Alert, AlertDescription, AlertTitle } from "../alert"
import { Avatar, AvatarFallback } from "../avatar"
import { Toaster } from "../toaster"
import { toast } from "../use-toast"

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

describe("toast", () => {
  const show = (variant: "default" | "success" | "destructive" | "info") => {
    render(<Toaster />)
    act(() => {
      toast({ title: `Toast ${variant}`, variant })
    })
    return screen.getByText(`Toast ${variant}`).closest("li")
  }

  it.each([
    ["success", "success-soft"],
    ["destructive", "destructive-soft"],
    ["info", "primary-soft"],
  ] as const)("la variante %s usa la terna %s", (variant, soft) => {
    has(
      show(variant),
      `bg-${soft}`,
      `border-${soft}-border`,
      `text-${soft}-foreground`
    )
  })

  it("il neutro è su card con bordo border, ombra pop e raggio 12 px", () => {
    has(
      show("default"),
      "bg-card",
      "border-border",
      "text-foreground",
      "shadow-pop",
      "rounded-sheet"
    )
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
