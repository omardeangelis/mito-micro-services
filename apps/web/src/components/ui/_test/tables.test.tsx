import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "../pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table"
import { Tabs, TabsList, TabsTrigger } from "../tabs"
import { ToggleGroup, ToggleGroupItem } from "../toggle-group"

// Tabelle, tab, toggle group e paginazione della spec design-system-web (AC13,
// AC14, AC15, AC22). In jsdom il CSS non c'è: la classe è il contratto col token
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

describe("Table", () => {
  const renderTable = () =>
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>Rossi</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

  it("il contenitore ha bordo border e raggio 10 px; le cifre sono tabellari", () => {
    renderTable()
    has(slot("table-container"), "border", "border-border", "rounded-card")
    expect([
      ...classes(slot("table")),
      ...classes(slot("table-cell")),
    ]).toContain("tabular-nums")
  })

  it("l'header è muted, alto 36 px, in muted-foreground a 12 px peso 550", () => {
    renderTable()
    const head = screen.getByRole("columnheader", { name: "Nome" })
    has(head, "bg-muted", "text-muted-foreground", "text-xs", "font-label")
    expect(head.className).toMatch(/(^|\s)h-(9|\[36px\])(\s|$)/)
  })

  it("la cella è alta 38 px con 3 px di padding: ci stanno un controllo da 30 px e il bordo della riga", () => {
    renderTable()
    has(slot("table-cell"), "h-9.5", "py-0.75")
  })

  it("le righe sono separate da border, hover accent, selezionata primary-soft", () => {
    renderTable()
    const row = screen.getByRole("row", { name: "Rossi" })
    has(
      row,
      "border-b",
      "hover:bg-accent",
      "data-[state=selected]:bg-primary-soft"
    )
  })
})

describe("Tabs", () => {
  it("binario muted con bordo; voce scelta card, foreground e shadow-xs; le altre muted-foreground", () => {
    render(
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>
      </Tabs>
    )
    has(
      slot("tabs-list"),
      "bg-muted",
      "border",
      "border-border",
      "rounded-card"
    )
    const tab = screen.getByRole("tab", { name: "Admin" })
    has(
      tab,
      "text-muted-foreground",
      "data-[state=active]:bg-card",
      "data-[state=active]:text-foreground",
      "data-[state=active]:shadow-xs"
    )
    expect(classes(tab)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^data-\[state=active\]:(border|ring)-border$/),
      ])
    )
    focusRing(tab)
  })
})

describe("ToggleGroup", () => {
  it("binario muted con bordo; voce accesa card, foreground e shadow-xs", () => {
    render(
      <ToggleGroup type="single" defaultValue="mese">
        <ToggleGroupItem value="mese">Mese</ToggleGroupItem>
        <ToggleGroupItem value="anno">Anno</ToggleGroupItem>
      </ToggleGroup>
    )
    has(
      slot("toggle-group"),
      "bg-muted",
      "border",
      "border-border",
      "rounded-card"
    )
    const item = screen.getByRole("radio", { name: "Anno" })
    has(
      item,
      "text-muted-foreground",
      "data-[state=on]:bg-card",
      "data-[state=on]:text-foreground",
      "data-[state=on]:shadow-xs"
    )
    focusRing(item)
  })
})

describe("Pagination", () => {
  it("la pagina corrente è card, contorno border-strong e peso 600", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              2
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    )
    has(
      screen.getByRole("link", { name: "2" }),
      "bg-card",
      "border",
      "border-border-strong",
      "font-semibold"
    )
  })
})
