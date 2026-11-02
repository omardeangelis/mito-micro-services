import { screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@mito/contract/task"
import { contactCustomer, contactRow, fakeContacts } from "@/test/contacts"
import { findTable, renderContacts } from "./page"

// The dates of a row of the list, as the columns of `ContactColumns` of the
// Next.js app: «Prossimo alert» keeps an expired open alert with «Scaduto»
// (AC24), «Contattato il» is the last call, Non risponde included (AC29)

afterEach(() => {
  vi.useRealTimers()
})

/** The list is read at 12:00 of 15/10/2026 in Rome */
const readAt = () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"))
}

const renderRows = async (rows: ContactRow[]) => {
  const backend = fakeContacts({ rows })
  const view = renderContacts("/dashboard/contatti", backend)
  await findTable()
  return view
}

/** The body row of the customer with this "Cognome Nome" */
const rowOf = (customerName: string) =>
  screen.getByRole("link", { name: customerName }).closest("tr")!

/** The text of the cell of `row` under the column with this header */
const cellOf = (row: HTMLElement, columnName: string) => {
  const headers = screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent?.trim())
  const index = headers.indexOf(columnName)
  expect(index).toBeGreaterThanOrEqual(0)
  return within(row).getAllByRole("cell")[index]!.textContent?.trim()
}

const namedRow = (
  id: number,
  surname: string,
  overrides: Partial<ContactRow> = {}
): ContactRow =>
  contactRow({
    id,
    customer: contactCustomer({ id: `c${id}`, name: "Test", surname }),
    ...overrides,
  })

describe("«Prossimo alert» e «Contattato il» della riga (AC24, AC29)", () => {
  it("tdd_target: un alert aperto scaduto da 2 giorni resta nella riga con il segno «Scaduto»", async () => {
    readAt()
    await renderRows([
      namedRow(1, "Scaduto", {
        alert: {
          id: 7,
          deadline: new Date("2026-10-13T08:00:00Z"),
          message: null,
        },
      }),
    ])

    const row = within(rowOf("Scaduto Test"))
    expect(row.getByText("13/10/2026")).toBeTruthy()
    expect(row.getByText("Scaduto")).toBeTruthy()
  })

  it("«Contattato il» mostra la data di oggi quando l'ultima chiamata è di oggi", async () => {
    readAt()
    await renderRows([
      namedRow(2, "Chiamato", {
        closedAt: new Date("2026-10-15T08:30:00Z"),
      }),
    ])

    expect(cellOf(rowOf("Chiamato Test"), "Contattato il")).toBe("15/10/2026")
  })
})
