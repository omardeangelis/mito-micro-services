import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Calendar } from "../calendar"
import { Card } from "../card"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../popover"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../sheet"
import { Skeleton } from "../skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip"

// Superfici sollevate e calendario della spec design-system-web (AC13, AC19,
// AC20). In jsdom il CSS non c'è: la classe è il contratto col token
const classes = (el: Element | null) =>
  (el?.getAttribute("class") ?? "").split(/\s+/)

const has = (el: Element | null, ...expected: string[]) =>
  expect(classes(el)).toEqual(expect.arrayContaining(expected))

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)

// Il contorno ring di 2 px a 2 px col focus da tastiera (AC13)
const focusRing = (el: Element | null) =>
  has(
    el,
    "focus-visible:outline-2",
    "focus-visible:outline-offset-2",
    "focus-visible:outline-ring"
  )

describe("Dialog", () => {
  it("l'overlay è overlay; il contenuto è card con bordo, shadow-pop e raggio 12 px", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Assegna</DialogTitle>
          <DialogDescription>Scegli l'operatore</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    has(slot("dialog-overlay"), "bg-overlay")
    has(
      slot("dialog-content"),
      "bg-card",
      "border",
      "border-border",
      "shadow-pop",
      "rounded-sheet"
    )
    focusRing(slot("dialog-close"))
  })
})

describe("Sheet", () => {
  it("l'overlay è overlay; il contenuto è card con bordo e shadow-pop", () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Cliente</SheetTitle>
          <SheetDescription>Dettaglio</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    has(slot("sheet-overlay"), "bg-overlay")
    has(slot("sheet-content"), "bg-card", "border-border", "shadow-pop")
  })
})

describe("Popover", () => {
  it("è card con bordo border, shadow-pop e raggio 12 px", () => {
    render(
      <Popover open>
        <PopoverTrigger>Filtri</PopoverTrigger>
        <PopoverContent>Contenuto</PopoverContent>
      </Popover>
    )
    has(
      slot("popover-content"),
      "bg-card",
      "border",
      "border-border",
      "shadow-pop",
      "rounded-sheet"
    )
  })
})

describe("DropdownMenu", () => {
  it("è card con bordo border e shadow-pop; le voci hanno il focus di AC13 e l'hover accent", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Azioni</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Modifica</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    has(
      slot("dropdown-menu-content"),
      "bg-card",
      "border",
      "border-border",
      "shadow-pop"
    )
    const item = screen.getByRole("menuitem", { name: "Modifica" })
    focusRing(item)
    expect(classes(item)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(hover|focus|data-\[highlighted\]):bg-accent$/),
      ])
    )
  })
})

describe("Command", () => {
  it("la voce scelta con le frecce ha il contorno di AC13: il focus resta nel campo di ricerca", async () => {
    render(
      <Command>
        <CommandInput placeholder="Cerca" />
        <CommandList>
          <CommandGroup>
            <CommandItem>Excel</CommandItem>
            <CommandItem>CSV</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    )
    const search = screen.getByPlaceholderText("Cerca")
    await userEvent.click(search)
    await userEvent.keyboard("{ArrowDown}")
    const item = screen.getByRole("option", { name: "CSV" })
    expect(item.getAttribute("data-selected")).toBe("true")
    expect(document.activeElement).toBe(search)
    // Il campo di ricerca col focus: il bordo ring e l'alone di AC11, sulla
    // sua riga
    has(
      slot("command-input-wrapper"),
      "has-[input:focus-visible]:border-ring",
      "has-[input:focus-visible]:ring-[3px]",
      "has-[input:focus-visible]:ring-ring-soft"
    )
    has(
      item,
      "data-[selected=true]:outline-2",
      "data-[selected=true]:outline-offset-2",
      "data-[selected=true]:outline-ring"
    )
  })
})

describe("Tooltip", () => {
  it("è tooltip con testo tooltip-foreground", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Info</TooltipTrigger>
          <TooltipContent>Aiuto</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    has(slot("tooltip-content"), "bg-tooltip", "text-tooltip-foreground")
  })
})

describe("Skeleton e Card", () => {
  it("lo skeleton è muted; la card ha raggio 10 px e shadow-card", () => {
    render(
      <>
        <Skeleton />
        <Card>Totale</Card>
      </>
    )
    has(slot("skeleton"), "bg-muted")
    has(slot("card"), "bg-card", "border-border", "rounded-card", "shadow-card")
  })
})

describe("Calendar", () => {
  // Le classi della cella del giorno di ottobre e del suo bottone, insieme
  const day = (n: number) =>
    screen.getByRole("button", {
      name: new RegExp(`October ${n}(st|nd|rd|th)`),
    })

  it("il giorno scelto è primary; oggi è muted con testo foreground a 600", () => {
    render(
      <Calendar
        mode="single"
        month={new Date(2026, 9, 1)}
        today={new Date(2026, 9, 29)}
        selected={new Date(2026, 9, 15)}
      />
    )
    // Ogni giorno ha le stesse classi: il primary lo accende l'attributo del
    // giorno scelto, che un giorno qualunque non ha
    expect(day(15).getAttribute("data-selected-single")).toBe("true")
    expect(day(10).getAttribute("data-selected-single")).not.toBe("true")
    has(
      day(15),
      "data-[selected-single=true]:bg-primary",
      "data-[selected-single=true]:text-primary-foreground"
    )
    // Oggi: la cella è muted e foreground; il bottone, altrimenti
    // font-normal, prende il 600 dalla cella
    has(day(29).closest("td"), "bg-muted", "text-foreground")
    expect(classes(day(10).closest("td"))).not.toContain("bg-muted")
    // The 600 needs the cell's group and attribute of today: the 10th, not
    // today, stays at 400
    const today = day(29).closest("td")!
    expect(today.getAttribute("data-today")).toBe("true")
    has(today, "group/day")
    has(day(29), "group-data-[today=true]/day:font-semibold")
    expect(day(10).closest("td")!.hasAttribute("data-today")).toBe(false)
    has(day(10), "font-normal")
    // The only 600 is the one of today, on the button: not a class of every
    // day, nor one the cell gives to its button
    expect(classes(day(10)).filter((c) => c.includes("semibold"))).toEqual([
      "group-data-[today=true]/day:font-semibold",
    ])
    expect(
      classes(day(10).closest("td")).filter((c) => c.includes("semibold"))
    ).toEqual([])
  })
})
