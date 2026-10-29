import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "../button"

// Le varianti e le misure di Button della spec design-system-web (AC10, AC13,
// appendice C). In jsdom il CSS non c'è: la classe è il contratto col token
const classes = (name: string) =>
  screen.getByRole("button", { name }).className.split(" ")

// Una misura in px, come classe della scala (0.25rem = 4 px) o arbitraria
const size = (prefix: "h" | "size", px: number) =>
  new RegExp(`(^| )${prefix}-(${px / 4}|\\[${px}px\\])( |$)`)

describe("Button", () => {
  it("il primario ha il token del suo hover, 30 px e il raggio dei controlli", () => {
    render(<Button>Salva</Button>)
    expect(classes("Salva")).toEqual(
      expect.arrayContaining([
        "bg-primary",
        "text-primary-foreground",
        "shadow-xs",
        "hover:bg-primary-hover",
        "rounded-control",
        "text-sm",
      ])
    )
    expect(screen.getByRole("button").className).toMatch(size("h", 30))
  })

  it("col focus da tastiera ha il contorno ring di 2 px a 2 px", () => {
    render(<Button>Salva</Button>)
    const className = screen.getByRole("button").className
    expect(className).toMatch(/(^| )focus-visible:outline-2( |$)/)
    expect(className).toMatch(/(^| )(focus-visible:)?outline-offset-2( |$)/)
    expect(className).toMatch(/(^| )(focus-visible:)?outline-ring( |$)/)
    expect(className).not.toContain("ring-[3px]")
  })

  it.each([
    [
      "outline",
      [
        "bg-card",
        "border-border-strong",
        "text-foreground",
        "shadow-xs",
        "hover:bg-accent",
      ],
    ],
    [
      "secondary",
      [
        "bg-card",
        "border-border-strong",
        "text-foreground",
        "shadow-xs",
        "hover:bg-accent",
      ],
    ],
    [
      "ghost",
      ["text-muted-foreground", "hover:bg-accent", "hover:text-foreground"],
    ],
    [
      "destructive",
      [
        "bg-destructive",
        "text-destructive-foreground",
        "hover:bg-destructive-hover",
      ],
    ],
    ["link", ["text-link", "underline-offset-3"]],
    ["disabled", ["bg-muted", "text-subtle"]],
  ] as const)("la variante %s ha i token di AC10", (variant, expected) => {
    render(<Button variant={variant}>{variant}</Button>)
    expect(classes(variant)).toEqual(expect.arrayContaining([...expected]))
  })

  it.each([
    ["sm", 26],
    ["xs", 22],
    ["lg", 34],
  ] as const)("la taglia %s è alta %d px", (taglia, px) => {
    render(<Button size={taglia}>{taglia}</Button>)
    expect(screen.getByRole("button").className).toMatch(size("h", px))
  })

  it.each([
    ["icon", 30],
    ["icon-sm", 26],
    ["icon-xs", 22],
    ["icon-lg", 34],
  ] as const)("il bottone-icona %s è un quadrato di %d px", (taglia, px) => {
    render(<Button size={taglia} aria-label={taglia} />)
    expect(screen.getByRole("button").className).toMatch(size("size", px))
  })

  it("con l'attributo disabled è al 50% di opacità", () => {
    render(<Button disabled>Salva</Button>)
    expect(classes("Salva")).toContain("disabled:opacity-50")
  })
})
