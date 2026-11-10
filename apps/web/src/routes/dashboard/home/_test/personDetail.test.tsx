import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { parse } from "@mito/client/contact/searchParams"
import { fakeAdminHome, teamDetail, teamMember } from "@/test/adminHome"
import { useRefreshAdminHome } from "@/api/home"
import { AdminHome } from "../AdminHome"
import { renderHome } from "./page"

// The detail of a person of the team (spec home-admin, AC29)

const overdueRows = (count: number) =>
  Array.from({ length: Math.min(count, 6) }, (_, i) => ({
    taskId: 100 + i,
    name: `Cliente ${i + 1}`,
    message: null,
    daysLate: 9 - i,
    triedAt: null,
  }))

describe("Il dettaglio di una persona (AC29)", () => {
  it("con 7 arretrati ne mostra 6 e un link a Contatti il cui indirizzo dà i filtri del conteggio", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({
        members: [
          teamMember({
            operatorId: 7,
            name: "Ada Rossi",
            overdue: { total: 7, oldestDays: 9, rows: overdueRows(7) },
          }),
        ],
      }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Ada Rossi" }))

    const box = screen.getByRole("region", { name: /^Arretrati · 7/ })
    expect(within(box).getAllByRole("link", { name: /^Cliente/ })).toHaveLength(
      6
    )
    const all = within(box).getByRole("link", {
      name: "Vedi tutti i 7 in Contatti",
    })
    const url = new URL(all.getAttribute("href")!, "http://localhost")
    expect(url.pathname).toBe("/dashboard/contatti")
    expect(parse(Object.fromEntries(url.searchParams))).toMatchObject({
      operatorIds: [7],
      hasAlert: true,
      dateField: "nextAlert",
      to: "2026-11-04",
      orderBy: "nextAlert",
      sortedBy: "asc",
    })
  })
})

type Call = {
  id: number
  at: Date
  taskId: number | null
  name: string | null
  outcome: "chiamare" | "non risponde" | "richiamare" | "app.to" | null
  message: string | null
}

const calls = (count: number, overrides: Partial<Call> = {}): Call[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    at: new Date(Date.UTC(2026, 10, 5, 9, 0) - i * 60_000),
    taskId: 200 + i,
    name: `Chiamato ${i + 1}`,
    outcome: null,
    message: null,
    ...overrides,
  }))

const openPerson = async (
  members: Parameters<typeof teamDetail>[0] extends infer P
    ? P extends { members?: infer M }
      ? M
      : never
    : never,
  name = "Ada Rossi"
) => {
  const user = userEvent.setup()
  renderHome("/dashboard", fakeAdminHome({ team: teamDetail({ members }) }), {
    role: "ADMIN",
  })
  await user.click(await screen.findByRole("button", { name }))
  return user
}

const callsBox = () => screen.getByRole("region", { name: /^Chiamate di oggi/ })

describe("Chiamate di oggi nel dettaglio di una persona (AC29)", () => {
  it("con 8 chiamate le mostra tutte senza pulsante", async () => {
    await openPerson([teamMember({ name: "Ada Rossi", todayCalls: calls(8) })])
    const box = callsBox()
    expect(within(box).getAllByRole("listitem")).toHaveLength(8)
    expect(within(box).queryByRole("button")).not.toBeInTheDocument()
  })

  it("con 9 ne mostra 8, poi «Mostra tutte le 9» e «Mostra solo le ultime»", async () => {
    const user = await openPerson([
      teamMember({ name: "Ada Rossi", todayCalls: calls(9) }),
    ])
    const box = callsBox()
    expect(within(box).getAllByRole("listitem")).toHaveLength(8)
    expect(box).toHaveTextContent("Chiamate di oggi · 9")
    await user.click(
      within(box).getByRole("button", { name: "Mostra tutte le 9" })
    )
    expect(within(box).getAllByRole("listitem")).toHaveLength(9)
    await user.click(
      within(box).getByRole("button", { name: "Mostra solo le ultime" })
    )
    expect(within(box).getAllByRole("listitem")).toHaveLength(8)
  })

  it("mostra ora, cliente, badge dell'esito e messaggio", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        todayCalls: calls(1, {
          outcome: "non risponde",
          message: "Squilla a vuoto",
        }),
      }),
    ])
    const item = within(callsBox()).getByRole("listitem")
    expect(item).toHaveTextContent("10:00")
    expect(within(item).getByRole("link")).toHaveTextContent("Chiamato 1")
    expect(item).toHaveTextContent("Non risponde")
    expect(item).toHaveTextContent("Squilla a vuoto")
  })

  it("una chiamata senza taskId mostra il cliente senza link", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        todayCalls: calls(1, { taskId: null }),
      }),
    ])
    const box = callsBox()
    expect(within(box).getByText("Chiamato 1")).toBeVisible()
    expect(within(box).queryByRole("link")).not.toBeInTheDocument()
  })

  it("senza chiamate dice che la persona non ne ha registrate, col nome proprio", async () => {
    await openPerson([teamMember({ name: "Ada Rossi" })])
    expect(callsBox()).toHaveTextContent(
      "Ada non ha ancora registrato chiamate oggi."
    )
    expect(callsBox()).toHaveTextContent("Chiamate di oggi · 0")
  })
})

describe("Un cliente senza nome (AC29, AC31)", () => {
  const NO_NAME = "Cliente senza nome"

  it("nelle chiamate: il link e la riga senza contatto dicono «Cliente senza nome»", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        todayCalls: [
          ...calls(1, { name: null }),
          ...calls(1, { id: 2, name: null, taskId: null }),
        ],
      }),
    ])
    const [linked, plain] = within(callsBox()).getAllByRole("listitem")
    expect(
      within(linked!).getByRole("link", { name: NO_NAME })
    ).toHaveTextContent(NO_NAME)
    expect(within(plain!).getByText(NO_NAME)).toBeVisible()
    expect(within(plain!).queryByRole("link")).not.toBeInTheDocument()
  })

  it("negli arretrati: il link dice «Cliente senza nome»", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        overdue: {
          total: 1,
          oldestDays: 9,
          rows: [{ ...overdueRows(1)[0]!, name: null }],
        },
      }),
    ])
    const box = screen.getByRole("region", { name: /^Arretrati · 1/ })
    expect(within(box).getByRole("link", { name: NO_NAME })).toBeVisible()
  })
})

describe("Arretrati nel dettaglio di una persona (AC29)", () => {
  it("con 6 arretrati non c'è il link a Contatti", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        overdue: { total: 6, oldestDays: 9, rows: overdueRows(6) },
      }),
    ])
    const box = screen.getByRole("region", { name: /^Arretrati · 6/ })
    expect(within(box).getAllByRole("link")).toHaveLength(6)
    expect(
      within(box).queryByRole("link", { name: /Vedi tutti/ })
    ).not.toBeInTheDocument()
  })

  it("«Tentato alle HH:mm» prende il posto del messaggio", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        overdue: {
          total: 1,
          oldestDays: 3,
          rows: [
            {
              taskId: 1,
              name: "Cliente 1",
              message: "Da richiamare",
              daysLate: 3,
              triedAt: new Date("2026-11-05T08:35:00.000Z"),
            },
          ],
        },
      }),
    ])
    const box = screen.getByRole("region", { name: /^Arretrati · 1/ })
    expect(box).toHaveTextContent("Tentato alle 09:35")
    expect(box).not.toHaveTextContent("Da richiamare")
  })

  it("senza messaggio dice «Nessun messaggio»; il segno è «da ieri» o «da N giorni»", async () => {
    await openPerson([
      teamMember({
        name: "Ada Rossi",
        overdue: {
          total: 2,
          oldestDays: 9,
          rows: [
            {
              ...overdueRows(1)[0]!,
              taskId: 1,
              name: "Cliente 1",
              daysLate: 9,
            },
            {
              ...overdueRows(1)[0]!,
              taskId: 2,
              name: "Cliente 2",
              daysLate: 1,
            },
          ],
        },
      }),
    ])
    const box = screen.getByRole("region", { name: /^Arretrati · 2/ })
    expect(within(box).getAllByText("Nessun messaggio")).toHaveLength(2)
    expect(within(box).getByText("da 9 giorni")).toBeVisible()
    expect(within(box).getByText("da ieri")).toBeVisible()
  })

  it("senza arretrati dice «Nessun richiamo scaduto.»", async () => {
    await openPerson([teamMember({ name: "Ada Rossi" })])
    expect(
      screen.getByRole("region", { name: /^Arretrati · 0/ })
    ).toHaveTextContent("Nessun richiamo scaduto.")
  })
})

describe("Più persone aperte (AC28, AC29, AC50)", () => {
  const members = [
    teamMember({ operatorId: 7, userId: "u7", name: "Ada Rossi" }),
    teamMember({ operatorId: 8, userId: "u8", name: "Bruno Neri" }),
  ]

  it("più dettagli restano aperti insieme, ognuno si apre e si chiude", async () => {
    const user = await openPerson(members)
    await user.click(screen.getByRole("button", { name: "Bruno Neri" }))
    expect(screen.getAllByRole("region", { name: /^Arretrati/ })).toHaveLength(
      2
    )
    await user.click(screen.getByRole("button", { name: "Ada Rossi" }))
    expect(screen.getAllByRole("region", { name: /^Arretrati/ })).toHaveLength(
      1
    )
    expect(screen.getByRole("button", { name: "Bruno Neri" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("il pulsante ha aria-expanded e aria-controls sul dettaglio; i titoli sono h4", async () => {
    const user = userEvent.setup()
    renderHome("/dashboard", fakeAdminHome({ team: teamDetail({ members }) }), {
      role: "ADMIN",
    })
    const button = await screen.findByRole("button", { name: "Ada Rossi" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    const id = button.getAttribute("aria-controls")!
    expect(document.getElementById(id)).not.toBeVisible()
    await user.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    const detail = document.getElementById(id)!
    expect(detail).toBeVisible()
    const titles = within(detail).getAllByRole("heading", { level: 4 })
    expect(titles.map((t) => t.textContent)).toStrictEqual([
      "Chiamate di oggi · 0",
      "Arretrati · 0, dal più vecchio",
    ])
  })

  it("una rilettura che fallisce e il suo «Riprova» tengono aperta la persona", async () => {
    const backend = fakeAdminHome({ team: teamDetail({ members }) })
    const user = userEvent.setup()
    function Page() {
      const refresh = useRefreshAdminHome()
      return (
        <>
          <button type="button" onClick={refresh}>
            Rileggi
          </button>
          <AdminHome />
        </>
      )
    }
    renderHome("/dashboard", backend, { role: "ADMIN", page: <Page /> })

    await user.click(await screen.findByRole("button", { name: "Ada Rossi" }))
    backend.failWith("getTeamDetail")
    await user.click(screen.getByRole("button", { name: /Rileggi/ }))
    const message = await screen.findByText(
      "Non è stato possibile caricare i numeri del team."
    )
    backend.clearFailure("getTeamDetail")
    await user.click(
      within(message.parentElement!).getByRole("button", { name: /Riprova/ })
    )
    expect(
      await screen.findByRole("button", { name: "Ada Rossi" })
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("region", { name: /^Arretrati · 0/ })).toBeVisible()
  })
})
