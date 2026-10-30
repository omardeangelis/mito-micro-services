import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Checkbox } from "../checkbox"
import { RadioGroup, RadioGroupItem } from "../radio-group"
import { Switch } from "../switch"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../accordion"
import { Button } from "../button"
import { Tabs, TabsList, TabsTrigger } from "../tabs"
import { Toast, ToastAction, ToastProvider, ToastViewport } from "../toast"

// Checkbox, radio e switch della spec design-system-web (AC12, AC13)
const has = (el: HTMLElement, ...expected: string[]) =>
  expect(el.className.split(/\s+/)).toEqual(expect.arrayContaining(expected))

// Il contorno ring di 2 px a 2 px col focus da tastiera (AC13)
const focusRing = (el: HTMLElement) => {
  expect(el.className).toMatch(/(^|\s)focus-visible:outline-2(\s|$)/)
  expect(el.className).toMatch(/(^|\s)(focus-visible:)?outline-offset-2(\s|$)/)
  expect(el.className).toMatch(/(^|\s)(focus-visible:)?outline-ring(\s|$)/)
}

describe("Checkbox", () => {
  it("è di 16 px, bordo control di 1,5 px e raggio dei check; accesa su primary", () => {
    render(<Checkbox aria-label="Seleziona" />)
    const box = screen.getByRole("checkbox", { name: "Seleziona" })
    has(
      box,
      "size-4",
      "border-[1.5px]",
      "border-control",
      "rounded-check",
      "data-[state=checked]:bg-primary",
      "data-[state=checked]:text-primary-foreground",
      "data-[state=indeterminate]:bg-primary",
      "data-[state=indeterminate]:text-primary-foreground"
    )
    focusRing(box)
  })
})

describe("RadioGroupItem", () => {
  it("è rotondo, di 16 px, bordo control; scelto ha bordo e pallino primary", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="Uno" />
        <RadioGroupItem value="b" aria-label="Due" />
      </RadioGroup>
    )
    const off = screen.getByRole("radio", { name: "Due" })
    has(
      off,
      "size-4",
      "rounded-full",
      "border-control",
      "data-[state=checked]:border-primary"
    )
    focusRing(off)
    const dot = screen.getByRole("radio", { name: "Uno" }).querySelector("svg")
    expect(dot?.getAttribute("class")).toMatch(/(^|\s)fill-primary(\s|$)/)
  })
})

describe("Switch", () => {
  it("è 34 × 20 px, binario primary acceso e control spento, pomello card", () => {
    render(<Switch aria-label="Attivo" />)
    const track = screen.getByRole("switch", { name: "Attivo" })
    has(
      track,
      "data-[state=unchecked]:bg-control",
      "data-[state=checked]:bg-primary"
    )
    expect(track.className).toMatch(/(^|\s)w-(8\.5|\[34px\])(\s|$)/)
    expect(track.className).toMatch(/(^|\s)h-(5|\[20px\])(\s|$)/)
    focusRing(track)
    const thumb = track.firstElementChild as HTMLElement
    has(thumb, "bg-card")
  })
})

// Il contorno di AC13 compare subito: in Tailwind 4 `transition`,
// `transition-all` e `transition-colors` animano anche il colore del contorno,
// che partirebbe da currentColor. Le transizioni di oggi restano (Non-Goals)
describe("Il focus da tastiera non si anima", () => {
  const animatesOutline = ["transition", "transition-all", "transition-colors"]

  it("checkbox e radio cambiano stato all'istante, come prima", () => {
    render(
      <>
        <Checkbox aria-label="Accetto" />
        <RadioGroup aria-label="Sede">
          <RadioGroupItem value="roma" aria-label="Roma" />
        </RadioGroup>
      </>
    )
    has(screen.getByRole("checkbox", { name: "Accetto" }), "transition-shadow")
    has(
      screen.getByRole("radio", { name: "Roma" }),
      "transition-[color,box-shadow]"
    )
  })

  it("l'azione del toast non anima il contorno", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastAction altText="Apri il contatto">Apri</ToastAction>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )
    const action = screen.getByRole("button", { name: "Apri" })
    expect(action.className.split(/\s+/)).not.toEqual(
      expect.arrayContaining([expect.toBeOneOf(animatesOutline)])
    )
    has(action, "transition-[color,background-color,border-color]")
    // Nor in a variant, nor as an arbitrary property
    const transitions = action.className
      .split(/\s+/)
      .filter((c) => c.includes("transition"))
    expect(transitions).toEqual([
      "transition-[color,background-color,border-color]",
    ])
  })

  it("switch, bottone, tab e accordion non animano il contorno", () => {
    render(
      <>
        <Switch aria-label="Notifiche" />
        <Button>Salva</Button>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Uno</TabsTrigger>
          </TabsList>
        </Tabs>
        <Accordion type="single" collapsible>
          <AccordionItem value="a">
            <AccordionTrigger>Cliente</AccordionTrigger>
            <AccordionContent>Dati</AccordionContent>
          </AccordionItem>
        </Accordion>
      </>
    )
    for (const el of [
      screen.getByRole("switch", { name: "Notifiche" }),
      screen.getByRole("button", { name: "Salva" }),
      screen.getByRole("tab", { name: "Uno" }),
      screen.getByRole("button", { name: "Cliente" }),
    ]) {
      expect(el.className.split(/\s+/)).not.toEqual(
        expect.arrayContaining([expect.toBeOneOf(animatesOutline)])
      )
      expect(el.className).toMatch(/(^|\s)transition-\[[^\]]*\](\s|$)/)
      expect(el.className).not.toMatch(/transition-\[[^\]]*outline/)
    }
  })
})
