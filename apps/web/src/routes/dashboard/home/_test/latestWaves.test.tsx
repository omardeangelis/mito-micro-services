import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeAdminHome, latestWave, latestWaves } from "@/test/adminHome"
import { wavePageHref } from "../../import/_components/format"
import { renderHome } from "./page"

// The table of «Ultimi import» (spec home-admin, AC8–AC10, AC13)

const hrefOf = (id: number) =>
  wavePageHref({ id, format: "wave", status: "completed" })

const parts = {
  unassigned: 0,
  neverCalled: 0,
  calledNoOutcome: 0,
  worked: 0,
  noContact: 0,
}

describe("Ultimi import, il comando di ogni riga (AC13)", () => {
  it("una Wave con clienti senza operatore ha «Assegna», una senza ha «Apri»", async () => {
    const backend = fakeAdminHome({
      waves: latestWaves({
        rows: [
          latestWave({
            runId: 1,
            name: "NOV",
            customers: 3,
            parts: { ...parts, unassigned: 3 },
          }),
          latestWave({
            runId: 2,
            name: "OTT",
            customers: 3,
            parts: { ...parts, worked: 3 },
          }),
        ],
      }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const assign = await screen.findByRole("link", {
      name: "Assegna dalla NOV",
    })
    expect(assign).toHaveAttribute("href", hrefOf(1))
    expect(assign).toHaveTextContent("Assegna")
    const open = screen.getByRole("link", { name: "Apri la OTT" })
    expect(open).toHaveAttribute("href", hrefOf(2))
    expect(open).toHaveTextContent("Apri")
  })
})

const wave = (n: number, overrides: Parameters<typeof latestWave>[0] = {}) =>
  latestWave({ runId: n, name: `Wave ${n}`, ...overrides })

describe("Ultimi import, la tabella (AC8, AC9, AC10)", () => {
  it("senza import: il vuoto, senza tabella, riepilogo né legenda", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })

    expect(
      await screen.findByText("Nessun import Wave completato.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("columnheader", { name: "Wave" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/senza operatore ·/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("list", { name: "Legenda della barra" })
    ).not.toBeInTheDocument()
  })

  it.each([1, 4])("con %i righe: una riga per import", async (count) => {
    const rows = Array.from({ length: count }, (_, i) => wave(i + 1))
    renderHome("/dashboard", fakeAdminHome({ waves: latestWaves({ rows }) }), {
      role: "ADMIN",
    })

    await screen.findByText("Wave 1")
    expect(screen.getAllByRole("meter")).toHaveLength(count)
    for (const [index, name] of [
      "Wave",
      "Clienti",
      "Senza operatore",
      "Mai chiamati",
      "Avanzamento",
      "Azione",
    ].entries())
      expect(screen.getAllByRole("columnheader")[index]).toHaveTextContent(name)
  })

  it("il riepilogo e la legenda, con e senza clienti senza operatore", async () => {
    const view = renderHome(
      "/dashboard",
      fakeAdminHome({
        waves: latestWaves({
          rows: [wave(1)],
          unassignedDistinct: 2,
          neverCalledDistinct: 1,
        }),
      }),
      { role: "ADMIN" }
    )
    expect(
      await screen.findByText(
        "2 clienti senza operatore · 1 contatto mai chiamato"
      )
    ).toBeInTheDocument()
    const legend = screen.getByRole("list", { name: "Legenda della barra" })
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4)
    view.unmount()

    renderHome(
      "/dashboard",
      fakeAdminHome({
        waves: latestWaves({ rows: [wave(1)], neverCalledDistinct: 5 }),
      }),
      { role: "ADMIN" }
    )
    expect(
      await screen.findByText(
        "Nessun cliente senza operatore · 5 contatti mai chiamati"
      )
    ).toBeInTheDocument()
  })

  it("riepilogo e legenda solo a dati caricati (AC30)", async () => {
    const backend = fakeAdminHome({
      waves: latestWaves({ rows: [wave(1)] }),
    })
    const release = backend.hold("getLatestWaves")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    expect(
      await screen.findByText("Caricamento degli ultimi import")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("list", { name: "Legenda della barra" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/senza operatore/)).not.toBeInTheDocument()
    release()
    expect(
      await screen.findByRole("list", { name: "Legenda della barra" })
    ).toBeInTheDocument()
  })

  it("la riga sotto il nome: età e scadenza", async () => {
    renderHome(
      "/dashboard",
      fakeAdminHome({
        waves: latestWaves({
          rows: [
            wave(1, {
              importedAt: new Date("2026-11-05T09:00:00.000Z"),
              deadline: "2026-12-03",
            }),
            wave(2, {
              importedAt: new Date("2026-11-04T09:00:00.000Z"),
              status: "unconfirmed",
              deadline: null,
            }),
            wave(3, {
              importedAt: new Date("2026-11-01T09:00:00.000Z"),
              status: "expired",
              people: [
                {
                  operatorId: 1,
                  userId: "u1",
                  name: "Ada",
                  inactiveDays: null,
                  toCall: 7,
                  neverCalled: 0,
                },
              ],
            }),
          ],
        }),
      }),
      { role: "ADMIN" }
    )

    expect(await screen.findByText(/importata oggi/)).toHaveTextContent(
      "importata oggi · scade 3/12"
    )
    expect(screen.getByText(/importata ieri/)).toHaveTextContent(
      "importata ieri · scadenza da confermare"
    )
    expect(screen.getByText(/importata 4 giorni fa/)).toHaveTextContent(
      "importata 4 giorni fa · scaduta · 7 da fare"
    )
  })

  it("l'avanzamento: il meter con nome e testo, la percentuale per difetto, 0 clienti", async () => {
    renderHome(
      "/dashboard",
      fakeAdminHome({
        waves: latestWaves({
          rows: [
            wave(1, {
              customers: 3,
              parts: {
                ...parts,
                worked: 1,
                calledNoOutcome: 1,
                neverCalled: 1,
              },
            }),
            wave(2, { customers: 0 }),
          ],
        }),
      }),
      { role: "ADMIN" }
    )

    const meter = await screen.findByRole("meter", {
      name: "Avanzamento della Wave 1",
    })
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "1 lavorato, 1 chiamato senza esito, 1 mai chiamato, 0 senza operatore, su 3 clienti"
    )
    expect(screen.getByText("1 lavorato · 33%")).toBeInTheDocument()
    expect(screen.getByText("Nessun cliente")).toBeInTheDocument()
  })

  it("senza operatore: il numero, «Nessuno» con 0", async () => {
    renderHome(
      "/dashboard",
      fakeAdminHome({
        waves: latestWaves({
          rows: [
            wave(1, { customers: 2854, parts: { ...parts, unassigned: 2854 } }),
            wave(2),
          ],
        }),
      }),
      { role: "ADMIN" }
    )

    expect(await screen.findAllByText("2.854")).toHaveLength(2)
    expect(screen.getByText("Nessuno")).toBeInTheDocument()
  })

  it("un nome lungo resta intero nel DOM, con il title (AC33, AC50)", async () => {
    const name = "x".repeat(64) + ".xlsx"
    renderHome(
      "/dashboard",
      fakeAdminHome({ waves: latestWaves({ rows: [wave(1, { name })] }) }),
      { role: "ADMIN" }
    )

    const cell = await screen.findByText(name)
    expect(cell).toHaveAttribute("title", name)
    expect(cell).toHaveClass("truncate")
  })
})
