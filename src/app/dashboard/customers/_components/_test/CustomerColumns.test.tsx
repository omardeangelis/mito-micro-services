import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { seeContactsHref } from "@mito/client/contact/searchParams"
import {
  CustomerColumns,
  type CustomerColumnSelectedProps,
} from "../CustomerColumns"

// A server action: it pulls in `src/trpc/server.ts`, which needs Next's runtime
vi.mock("../../_actions/handleCustomerBlackList", () => ({
  handleCustomerBlackList: vi.fn(),
}))

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    default: forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a"> & { prefetch?: boolean }
    >(function LinkMock({ href, children, prefetch: _p, ...rest }, ref) {
      return (
        <a ref={ref} href={href} {...rest}>
          {children}
        </a>
      )
    }),
  }
})

const row = {
  id: "customer-1",
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
} as unknown as CustomerColumnSelectedProps

// Lo stato del contatto si cambia in Contatti (AC58): la tabella Clienti non
// ha più le colonne che lo leggono
describe("le colonne della tabella Clienti", () => {
  const ids = CustomerColumns.map((column) => column.id)
  const keys = CustomerColumns.map((column) =>
    "accessorKey" in column ? column.accessorKey : undefined
  )

  it("non hanno più 'Stato Chiamate', 'Contattato il' e 'Priorità'", () => {
    for (const id of ["Stato Chiamate", "Contattato il", "Priorità"]) {
      expect(ids).not.toContain(id)
    }
  })

  it("nessuna legge più il contatto del cliente", () => {
    for (const key of ["tasks", "contattato", "priority"]) {
      expect(keys).not.toContain(key)
    }
  })

  it("quelle del cliente restano", () => {
    expect(ids).toEqual(
      expect.arrayContaining([
        "select",
        "Nome",
        "Cognome",
        "Aggiornato il",
        "operatore",
        "actions",
      ])
    )
  })
})

describe("il menu azioni della riga cliente", () => {
  it("offre 'Vedi contatti': Contatti filtrata sul cliente, con i precedenti, dal più recente (AC21, AC62)", async () => {
    const user = userEvent.setup()
    const column = CustomerColumns.find((c) => c.id === "actions")!
    const cell = column.cell as (context: unknown) => React.ReactNode

    render(
      <QueryClientProvider client={new QueryClient()}>
        {cell({ row: { original: { ...row, id: "customer-1" } } })}
      </QueryClientProvider>
    )
    await user.click(screen.getByRole("button", { name: "Open menu" }))

    const link = screen.getByRole("menuitem", { name: "Vedi contatti" })
    expect(link.getAttribute("href")).toBe(seeContactsHref("customer-1"))
    expect(link.getAttribute("href")).toBe(
      "/dashboard/contatti?cliente=customer-1&precedenti=1&ordina=creato&verso=desc"
    )
  })
})
