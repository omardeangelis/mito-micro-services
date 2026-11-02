import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { type ContactDetail } from "@mito/contract/task"
import { contactDetail, contactRow } from "@/test/contacts"
import { DA, openDetail } from "./detail"

// Il dettaglio mostra gli stati con la loro etichetta: nello stato del
// contatto, nel richiamo con il giorno e nello Storico dei contatti (AC1, AC30)

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

const dataOf = (overrides: Partial<ContactDetail> = {}): ContactDetail =>
  contactDetail({
    contact: {
      state: "richiamare",
      priority: 70,
      customPriority: true,
      operator: giulia,
    },
    customer: { ...contactRow().customer, operatorId: giulia.id },
    alert: {
      id: 5,
      deadline: new Date("2026-10-20T22:00:00Z"),
      message: "Richiamare dopo le 15",
    },
    ...overrides,
  })

beforeEach(() => {
  sessionStorage.clear()
})

describe("il dettaglio, le etichette degli stati", () => {
  it("il richiamo mostra il giorno dell'alert aperto", async () => {
    await openDetail([dataOf()])

    // 2026-10-20 22:00 UTC is the 21st in Rome
    expect(screen.getByText("Richiamo · 21/10")).toBeTruthy()
  })

  it("app.to si legge Appuntamento", async () => {
    await openDetail([
      dataOf({
        contact: { ...dataOf().contact, state: "app.to" },
        alert: null,
      }),
    ])

    expect(screen.getByText("Appuntamento")).toBeTruthy()
    expect(screen.queryByText("app.to")).toBeNull()
  })

  it("lo Storico dei contatti dice le etichette, anche per i valori vecchi", async () => {
    const previous = [
      {
        id: 88,
        state: "erogata" as const,
        isActive: false,
        closedAt: new Date("2026-09-26T08:00:00Z"),
        createdAt: new Date("2026-09-20T08:00:00Z"),
        operator: null,
      },
      {
        id: 77,
        state: "followup" as const,
        isActive: false,
        closedAt: null,
        createdAt: new Date("2026-09-10T08:00:00Z"),
        operator: null,
      },
    ]
    await openDetail([dataOf({ customerContacts: previous, alert: null })], {
      da: DA,
    })

    const items = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getAllByRole("listitem")
    expect(within(items[0]!).getByText("Pratica caricata")).toBeTruthy()
    expect(within(items[1]!).getByText("Da chiamare")).toBeTruthy()
    expect(screen.queryByText("erogata")).toBeNull()
    expect(screen.queryByText("followup")).toBeNull()
  })
})
