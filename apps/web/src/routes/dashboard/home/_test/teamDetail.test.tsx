import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { useRefreshAdminHome } from "@/api/home"
import {
  fakeAdminHome,
  latestWave,
  latestWaves,
  teamDay,
  teamDetail,
  teamMember,
} from "@/test/adminHome"
import { wavePageHref } from "../../import/_components/format"
import { AdminHome } from "../AdminHome"
import { renderHome } from "./page"

// The table of «Dettaglio giornaliero» (spec home-admin, AC13, AC27, AC28)

const hrefOf = (id: number) =>
  wavePageHref({ id, format: "wave", status: "completed" })

const parts = {
  unassigned: 0,
  neverCalled: 0,
  calledNoOutcome: 0,
  worked: 0,
  noContact: 0,
}

const team = teamDetail({
  members: [teamMember({ operatorId: 7, name: "Ada Rossi" })],
})

describe("Dettaglio giornaliero, «Assegna» (AC13)", () => {
  it("con «Ultimi import» a schermo porta alla Wave con più clienti senza operatore, con la persona", async () => {
    const backend = fakeAdminHome({
      team,
      waves: latestWaves({
        rows: [
          latestWave({
            runId: 1,
            customers: 2,
            parts: { ...parts, unassigned: 2 },
          }),
          latestWave({
            runId: 2,
            customers: 5,
            parts: { ...parts, unassigned: 5 },
          }),
        ],
      }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const assign = await screen.findByRole("link", {
      name: "Assegna contatti a Ada Rossi",
    })
    expect(assign).toHaveAttribute("href", `${hrefOf(2)}?per=7`)
  })

  it("con «Ultimi import» in errore è disattivato", async () => {
    const backend = fakeAdminHome({ team })
    backend.failWith("getLatestWaves")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByText("Non è stato possibile caricare gli ultimi import.")
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Assegna contatti a Ada Rossi" })
      ).toBeDisabled()
    )
  })
})

const assignName = "Assegna contatti a Ada Rossi"

/** Waves with customers to assign */
const wavesToAssign = latestWaves({
  rows: [latestWave({ runId: 2, parts: { ...parts, unassigned: 5 } })],
})

/** The admin's home with a button that reads the four parts again */
function HomeWithRefresh() {
  const refresh = useRefreshAdminHome()
  const [reads, setReads] = useState(0)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReads(reads + 1)
          void refresh()
        }}
      >
        Rileggi {reads}
      </button>
      <AdminHome />
    </>
  )
}

const disabledAssign = async () => {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: assignName })).toBeDisabled()
  )
}

describe("Dettaglio giornaliero, «Assegna» disattivato (AC13, D15)", () => {
  it("mentre «Ultimi import» si carica", async () => {
    const backend = fakeAdminHome({ team, waves: wavesToAssign })
    const release = backend.hold("getLatestWaves")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByRole("button", { name: assignName })
    await disabledAssign()
    release()
    expect(await screen.findByRole("link", { name: assignName })).toBeVisible()
  })

  it("dopo il «Riprova» di «Ultimi import», finché arrivano i dati", async () => {
    const backend = fakeAdminHome({ team, waves: wavesToAssign })
    backend.failWith("getLatestWaves")
    const user = userEvent.setup()
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const part = (
      await screen.findByRole("heading", { name: "Ultimi import" })
    ).closest("section")!
    const retry = await within(part).findByRole("button", { name: /Riprova/ })
    backend.clearFailure("getLatestWaves")
    const release = backend.hold("getLatestWaves")
    await user.click(retry)

    await disabledAssign()
    release()
    expect(await screen.findByRole("link", { name: assignName })).toBeVisible()
  })

  it.each([
    ["nessuna Wave", latestWaves()],
    [
      "nessun cliente senza operatore",
      latestWaves({ rows: [latestWave({ runId: 1, customers: 3 })] }),
    ],
  ])("con %s", async (_, waves) => {
    const backend = fakeAdminHome({ team, waves })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByRole("button", { name: assignName })
    await waitFor(() => expect(backend.state.reads.getLatestWaves).toBe(1))
    await disabledAssign()
  })

  it("non cambia durante una rilettura che tiene i dati", async () => {
    const backend = fakeAdminHome({ team, waves: wavesToAssign })
    const user = userEvent.setup()
    renderHome("/dashboard", backend, {
      role: "ADMIN",
      page: <HomeWithRefresh />,
    })

    const link = await screen.findByRole("link", { name: assignName })
    const release = backend.hold("getLatestWaves")
    await user.click(screen.getByRole("button", { name: /Rileggi/ }))
    await waitFor(() => expect(backend.state.reads.getLatestWaves).toBe(2))

    expect(screen.getByRole("link", { name: assignName })).toBe(link)
    expect(link).toHaveAttribute("href", `${hrefOf(2)}?per=7`)
    release()
  })
})

/** The cells of the row of `name`, in the order of the columns */
const cellsOf = async (name: string) => {
  const row = (await screen.findByText(name)).closest("tr") as HTMLElement
  return within(row).getAllByRole("cell")
}

describe("Dettaglio giornaliero, le colonne (AC28, AC33)", () => {
  it("una persona con le chiamate di oggi", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({
        members: [
          teamMember({
            name: "Ada Rossi",
            calls: 3,
            answered: 1,
            appointments: 1,
            lastCallAt: new Date("2026-11-05T07:25:00.000Z"),
            toCall: 500,
            neverCalled: 120,
            overdue: { total: 4, oldestDays: 6, rows: [] },
          }),
        ],
      }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const cells = await cellsOf("Ada Rossi")
    expect(cells).toHaveLength(8)
    expect(cells[1]).toHaveTextContent(/^3$/)
    expect(cells[1]).not.toHaveClass("text-muted-foreground")
    expect(cells[2]).toHaveTextContent(/^33,3%$/)
    expect(cells[3]).toHaveTextContent(/^1$/)
    expect(cells[4]).toHaveTextContent("alle 08:25ferma da 1 h 35 min")
    expect(cells[5]).toHaveTextContent("4il più vecchio da 6 giorni")
    expect(cells[6]).toHaveTextContent("500120 mai chiamati")
    const alert = within(cells[5]!).getByText("4")
    expect(alert).toHaveClass("text-destructive-text")
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("una persona senza chiamate: «0» in grigio, «—», «Nessuno», «Finiti»", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({ members: [teamMember({ name: "Ada Rossi" })] }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const cells = await cellsOf("Ada Rossi")
    expect(cells[1]).toHaveTextContent(/^0$/)
    expect(cells[1]).toHaveClass("text-muted-foreground")
    expect(cells[2]).toHaveTextContent(/^—$/)
    expect(cells[3]).toHaveTextContent(/^—$/)
    expect(cells[4]).toHaveTextContent(/^Nessuna oggi$/)
    expect(cells[5]).toHaveTextContent(/^Nessuno$/)
    expect(cells[6]).toHaveTextContent(/^0Finiti$/)
  })

  it("il nome lungo resta intero nel testo e nel `title`, la colonna «Assegna» ha il suo nome", async () => {
    const long = "Maria Antonietta Benedetta De Gasperi Montefeltro Visconti"
    const backend = fakeAdminHome({
      team: teamDetail({ members: [teamMember({ name: long })] }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const name = await screen.findByText(long)
    expect(name).toHaveAttribute("title", long)
    expect(name).toHaveClass("truncate")
    expect(
      screen.getByRole("columnheader", { name: "Assegna" })
    ).toBeInTheDocument()
    expect(screen.getByRole("table")).toHaveClass("table-fixed")
  })
})

const operatore = (name: string, overrides = {}) =>
  teamMember({
    operatorId: name.charCodeAt(0),
    userId: name,
    name,
    role: "OPERATORE",
    ...overrides,
  })

const admin = (name: string, overrides = {}) =>
  operatore(name, { role: "ADMIN", ...overrides })

const groupButton = (name: RegExp) =>
  screen.findByRole("button", { name, expanded: true })

const heading = () =>
  screen.getByRole("heading", { name: "Dettaglio giornaliero" }).parentElement!

describe("Dettaglio giornaliero, i gruppi (AC27, AC31)", () => {
  it("«Operatori» aperto e «Admin» chiuso, con il loro conteggio, `h3`, `aria-expanded` e `aria-controls`", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({
        members: [
          operatore("Ada", { calls: 2 }),
          operatore("Bruno"),
          admin("Carla"),
        ],
      }),
    })
    const user = userEvent.setup()
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const operators = await groupButton(/^Operatori/)
    expect(operators).toHaveTextContent("Operatori· 1 su 2 ha chiamato")
    expect(operators.parentElement?.tagName).toBe("H3")
    expect(
      document.getElementById(operators.getAttribute("aria-controls")!)
    ).toContainElement(screen.getByText("Ada"))

    const admins = screen.getByRole("button", {
      name: /^Admin/,
      expanded: false,
    })
    expect(admins.parentElement?.tagName).toBe("H3")
    expect(admins).toHaveTextContent("Admin· 0 su 1 hanno chiamato")
    expect(
      document.getElementById(admins.getAttribute("aria-controls")!)
    ).not.toBeNull()
    expect(screen.queryByText("Carla")).not.toBeInTheDocument()

    await user.click(admins)
    expect(admins).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("columnheader", { name: "Admin" })
    ).toBeInTheDocument()
    expect(screen.getByText("Carla")).toBeVisible()

    await user.click(operators)
    expect(operators).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Ada")).not.toBeInTheDocument()
  })

  it("un gruppo vuoto non compare", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({ members: [admin("Carla")] }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByRole("button", { name: /^Admin/ })
    expect(
      screen.queryByRole("button", { name: /^Operatori/ })
    ).not.toBeInTheDocument()
  })
})

describe("Dettaglio giornaliero, il riepilogo (AC27, AC30)", () => {
  it("c'è solo a dati caricati, con gli arretrati quando ci sono", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({
        members: [
          operatore("Ada", { calls: 2 }),
          admin("Carla", { overdue: { total: 1, oldestDays: 2, rows: [] } }),
        ],
      }),
    })
    const release = backend.hold("getTeamDetail")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByText("Caricamento dei numeri del team")
    expect(heading()).not.toHaveTextContent("hanno chiamato")
    expect(heading()).not.toHaveTextContent("ha chiamato")

    release()
    expect(
      await screen.findByText("1 su 2 ha chiamato · 1 con arretrati")
    ).toBeVisible()
  })

  it("senza arretrati non li dice", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({ members: [operatore("Ada"), operatore("Bruno")] }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByText("Ada")
    expect(within(heading()).getByText("0 su 2 hanno chiamato")).toBeVisible()
  })

  it("con la parte in errore non c'è", async () => {
    const backend = fakeAdminHome({ team })
    backend.failWith("getTeamDetail")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await screen.findByText("Non è stato possibile caricare i numeri del team.")
    expect(heading()).not.toHaveTextContent("chiamato")
  })
})

const namesOnScreen = () =>
  screen
    .getAllByRole("row")
    .map((row) => within(row).queryAllByRole("cell")[0]?.textContent)
    .filter(Boolean)

const orderTeam = teamDetail({
  members: [
    operatore("Ada", { calls: 1 }),
    operatore("Bruno", {
      calls: 3,
      overdue: { total: 1, oldestDays: 2, rows: [] },
    }),
    operatore("Carla", {
      calls: 2,
      overdue: { total: 4, oldestDays: 2, rows: [] },
    }),
  ],
})

describe("Dettaglio giornaliero, «Ordina per» (AC27, D16)", () => {
  it("parte da «Arretrati», cambia subito e la voce scelta non si spegne", async () => {
    const backend = fakeAdminHome({ team: orderTeam })
    const user = userEvent.setup()
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const group = await screen.findByRole("radiogroup", {
      name: "Ordina per",
    })
    await screen.findByText("Ada")
    expect(namesOnScreen()).toStrictEqual(["Carla", "Bruno", "Ada"])
    const reads = backend.state.reads.getTeamDetail

    const chiamate = within(group).getByRole("radio", { name: "Chiamate" })
    await user.click(chiamate)
    expect(namesOnScreen()).toStrictEqual(["Bruno", "Carla", "Ada"])

    await user.click(within(group).getByRole("radio", { name: "Nome" }))
    expect(namesOnScreen()).toStrictEqual(["Ada", "Bruno", "Carla"])

    await user.click(within(group).getByRole("radio", { name: "Nome" }))
    expect(namesOnScreen()).toStrictEqual(["Ada", "Bruno", "Carla"])
    expect(backend.state.reads.getTeamDetail).toBe(reads)
  })

  it("l'ordine e i gruppi aperti sopravvivono a un errore di rilettura e al suo «Riprova»", async () => {
    const backend = fakeAdminHome({
      team: teamDetail({
        members: [...orderTeam.members, admin("Dora")],
      }),
    })
    const user = userEvent.setup()
    renderHome("/dashboard", backend, {
      role: "ADMIN",
      page: <HomeWithRefresh />,
    })

    await user.click(await screen.findByRole("radio", { name: "Nome" }))
    await user.click(
      screen.getByRole("button", { name: /^Admin/, expanded: false })
    )
    backend.failWith("getTeamDetail")
    await user.click(screen.getByRole("button", { name: /Rileggi/ }))
    const message = await screen.findByText(
      "Non è stato possibile caricare i numeri del team."
    )
    expect(screen.queryByText("Ada")).not.toBeInTheDocument()

    backend.clearFailure("getTeamDetail")
    await user.click(
      within(message.parentElement!).getByRole("button", {
        name: /Riprova/,
      })
    )
    await screen.findByText("Ada")
    expect(namesOnScreen()).toStrictEqual(["Ada", "Bruno", "Carla", "Dora"])
    expect(screen.getByRole("radio", { name: "Nome" })).toBeChecked()
    expect(screen.getByText("Dora")).toBeVisible()
  })
})

describe("Dettaglio giornaliero e «Chiamate oggi» (AC7)", () => {
  it("la somma delle chiamate dei due gruppi è il numero di oggi", async () => {
    const backend = fakeAdminHome({
      day: teamDay({ calls: 12, called: 3, members: 3 }),
      team: teamDetail({
        members: [
          operatore("Ada", { calls: 4 }),
          operatore("Bruno", { calls: 7 }),
          admin("Carla", { calls: 1 }),
        ],
      }),
    })
    const user = userEvent.setup()
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await user.click(await screen.findByRole("button", { name: /^Admin/ }))
    const calls = await Promise.all(
      ["Ada", "Bruno", "Carla"].map(async (name) =>
        Number((await cellsOf(name))[1]!.textContent)
      )
    )
    const total = calls.reduce((sum, value) => sum + value, 0)
    expect(
      await screen.findByText(`${total} · 3 su 3 hanno chiamato`)
    ).toBeVisible()
  })
})
