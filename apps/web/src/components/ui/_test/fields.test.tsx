import { render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { describe, expect, it } from "vitest"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../form"
import { Input } from "../input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select"
import { Textarea } from "../textarea"

// Campi, select e textarea della spec design-system-web (AC11, AC13, AC19,
// appendice C). In jsdom il CSS non c'è: la classe è il contratto col token
const classes = (el: Element | null) =>
  (el?.getAttribute("class") ?? "").split(/\s+/)

const has = (el: Element | null, ...expected: string[]) =>
  expect(classes(el)).toEqual(expect.arrayContaining(expected))

// Gli stati di AC11, comuni a campo, textarea e trigger della select
const fieldStates = (el: Element | null) => {
  has(
    el,
    "bg-card",
    "border-input",
    "hover:border-input-hover",
    "rounded-control",
    "text-sm",
    "focus-visible:border-ring",
    "focus-visible:ring-[3px]",
    "focus-visible:ring-ring-soft",
    "aria-invalid:border-destructive-text",
    "aria-invalid:ring-destructive-ring",
    "disabled:bg-muted",
    "disabled:text-muted-foreground"
  )
  // Disabilitato è muted su muted-foreground, non un campo sbiadito
  expect(classes(el)).not.toContain("disabled:opacity-50")
}

// Una misura in px, come classe della scala (0.25rem = 4 px) o arbitraria,
// con o senza la variante data-[size=…] del trigger
const height = (px: number, variant = "") =>
  new RegExp(
    `(^|\\s)${variant.replace(/[[\]=]/g, "\\$&")}h-(${px / 4}|\\[${px}px\\])(\\s|$)`
  )

describe("Input", () => {
  it("ha gli stati di AC11, 30 px e il raggio dei controlli", () => {
    render(<Input aria-label="Email" />)
    const input = screen.getByRole("textbox", { name: "Email" })
    fieldStates(input)
    has(input, "placeholder:text-muted-foreground")
    expect(input.className).toMatch(height(30))
  })
})

describe("Textarea", () => {
  it("ha gli stati di AC11 e il raggio dei controlli", () => {
    render(<Textarea aria-label="Nota" />)
    fieldStates(screen.getByRole("textbox", { name: "Nota" }))
  })
})

describe("Select", () => {
  const renderOpen = () =>
    render(
      <Select open defaultValue="roma">
        <SelectTrigger aria-label="Sede">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="roma">Roma</SelectItem>
          <SelectItem value="milano">Milano</SelectItem>
        </SelectContent>
      </Select>
    )

  it("il trigger ha gli stati dei campi, 30 px e 26 px nella taglia sm", () => {
    renderOpen()
    // Open, Radix hides everything but the menu from the accessibility tree
    const trigger = screen.getByRole("combobox", { name: "Sede", hidden: true })
    fieldStates(trigger)
    expect(trigger.className).toMatch(height(30, "data-[size=default]:"))
    expect(trigger.className).toMatch(height(26, "data-[size=sm]:"))
  })

  it("il menu si apre sotto il trigger anche quando il trigger non ha un SelectValue", () => {
    // The filters of the lists show a fixed label in the trigger: aligned to
    // the chosen item, Radix finds no value to align to and leaves the menu
    // off screen. Under the trigger (popper), as in the Next.js app
    render(
      <Select open>
        <SelectTrigger>
          <label>Operatore</label>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Mario Rossi</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(
      document
        .querySelector('[data-slot="select-content"]')
        ?.getAttribute("data-side")
    ).toBe("bottom")
  })

  it("il menu è alto al più 300 px, come la lista di File, e scorre", () => {
    render(
      <Select open>
        <SelectTrigger>
          <label>Sede</label>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="roma">Roma</SelectItem>
        </SelectContent>
      </Select>
    )
    has(
      document.querySelector('[data-slot="select-content"]'),
      "max-h-[min(var(--radix-select-content-available-height),300px)]",
      "overflow-y-auto"
    )
  })

  it("il menu è su card con bordo border e shadow-pop; le voci hanno il focus di AC13", () => {
    renderOpen()
    has(
      document.querySelector('[data-slot="select-content"]'),
      "bg-card",
      "border",
      "border-border",
      "shadow-pop"
    )
    const item = screen.getByRole("option", { name: "Milano" })
    has(
      item,
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-ring"
    )
  })
})

describe("FormMessage", () => {
  function Field() {
    const form = useForm({ defaultValues: { email: "" } })
    useEffect(() => {
      form.setError("email", { message: "Email obbligatoria" })
    }, [form])
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    )
  }

  it("l'errore è in destructive-text a 12 px", async () => {
    render(<Field />)
    has(
      await screen.findByText("Email obbligatoria"),
      "text-destructive-text",
      "text-xs"
    )
  })

  it("con l'errore l'etichetta passa a destructive-text", async () => {
    render(<Field />)
    await screen.findByText("Email obbligatoria")
    const label = screen.getByText("Email")
    expect(label.getAttribute("data-error")).toBe("true")
    has(label, "data-[error=true]:text-destructive-text")
  })
})
