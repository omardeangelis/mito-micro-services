import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { adminHomeKeys } from "@/api/home"
import { type AdminHomeEndpoint, fakeAdminHome } from "@/test/adminHome"
import { longDay } from "../../lavoro/_lib/format"
import { renderHome } from "./page"

// The page of the admin on a backend in memory (spec home-admin, AC1, AC3–AC5,
// AC30, AC49; andamenti-chiamate AC1, AC2): five blocks, parts that load and
// fail on their own

/** The four parts: the read, how many cells show it, its texts (AC30) */
const PARTS: ReadonlyArray<{
  endpoint: AdminHomeEndpoint
  cells: number
  loading: string
  error: string
}> = [
  {
    endpoint: "getTeamDay",
    cells: 3,
    loading: "Caricamento dei numeri di oggi",
    error: "Non è stato possibile caricare i numeri di oggi.",
  },
  {
    endpoint: "getMyCallbacks",
    cells: 1,
    loading: "Caricamento dei tuoi richiami",
    error: "Non è stato possibile caricare i tuoi richiami.",
  },
  {
    endpoint: "getLatestWaves",
    cells: 1,
    loading: "Caricamento degli ultimi import",
    error: "Non è stato possibile caricare gli ultimi import.",
  },
  {
    endpoint: "getTeamDetail",
    cells: 1,
    loading: "Caricamento dei numeri del team",
    error: "Non è stato possibile caricare i numeri del team.",
  },
]

/** The two sections, for the focus */
const SECTIONS = [
  {
    title: "Ultimi import",
    endpoint: "getLatestWaves",
    loading: "Caricamento degli ultimi import",
    error: "Non è stato possibile caricare gli ultimi import.",
  },
  {
    title: "Dettaglio giornaliero",
    endpoint: "getTeamDetail",
    loading: "Caricamento dei numeri del team",
    error: "Non è stato possibile caricare i numeri del team.",
  },
] as const

const toasts = () => document.querySelectorAll("[data-sonner-toast]")

/** «Riprova» of the error with this text; the first one, with more cells */
const retryOf = (message: HTMLElement) =>
  within(message.closest<HTMLElement>("[role=alert]")!).getByRole("button", {
    name: "Riprova",
  })

/** The page with no part loading */
const settled = () =>
  waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0))

describe("AdminHome, la pagina (AC1, AC3, AC4, AC5, AC36)", () => {
  it("un admin vede i cinque blocchi nell'ordine e niente card né ultime pratiche", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    await settled()

    const blocks = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByRole("navigation", { name: "Azioni rapide" }),
      screen.getByText("Chiamate oggi"),
      // The strip's: «Andamento delle chiamate» has its own, further down
      screen.getAllByText("Tasso di risposta")[0]!,
      screen.getAllByText("Tasso di appuntamento")[0]!,
      screen.getByText("I tuoi richiami"),
      screen.getByRole("region", { name: "Ultimi import" }),
      screen.getByRole("region", { name: "Dettaglio giornaliero" }),
      screen.getByRole("region", { name: "Andamento delle chiamate" }),
    ]
    blocks.slice(1).forEach((block, i) => {
      expect(
        blocks[i]!.compareDocumentPosition(block) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
    expect(screen.queryByText("Analisi Andamento")).toBeNull()
    expect(screen.queryByText("Ultime Pratiche Aggiornate")).toBeNull()
    expect(screen.queryByRole("link", { name: "Nuovo import" })).toBeNull()
    expect(document.querySelector("[data-admin-scroll]")).not.toBeNull()
  })

  it("un operatore vede `lavoro`, senza le azioni e senza le letture del team", async () => {
    const backend = fakeAdminHome({ role: "OPERATORE" })
    renderHome("/dashboard", backend, { role: "OPERATORE" })

    expect(await screen.findByText("Il mio oggi")).toBeTruthy()
    expect(
      screen.queryByRole("navigation", { name: "Azioni rapide" })
    ).toBeNull()
    expect(backend.state.reads).toMatchObject({
      getTeamDay: 0,
      getLatestWaves: 0,
      getTeamDetail: 0,
    })
  })

  it("il titolo ha il nome proprio dell'utente, sotto c'è la data di oggi", async () => {
    renderHome("/dashboard", fakeAdminHome({ operatorName: "Grace Hopper" }), {
      role: "ADMIN",
    })

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Buongiorno, Grace",
      })
    ).toBeTruthy()
    expect(screen.getByText(longDay(new Date()))).toBeTruthy()
  })

  it("le azioni rapide sono quattro link con icona, nell'ordine", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    await settled()

    const links = within(
      screen.getByRole("navigation", { name: "Azioni rapide" })
    ).getAllByRole("link")

    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Assegna da Clienti", "/dashboard/customers"],
      ["Importa", "/dashboard/import"],
      ["Analisi", "/dashboard/analisi"],
      ["Team", "/dashboard/settings/team"],
    ])
    for (const link of links) expect(link.querySelector("svg")).not.toBeNull()
  })

  it("l'export «Chiamate per operatore» non c'è più (andamenti-chiamate AC1)", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    await settled()

    expect(screen.queryByText("Chiamate per operatore")).toBeNull()
    expect(screen.queryByRole("button", { name: /Scarica/ })).toBeNull()
  })

  it("una home aperta fa una GET per lettura", async () => {
    const backend = fakeAdminHome()
    renderHome("/dashboard", backend, { role: "ADMIN" })
    await settled()

    expect(backend.state.reads).toEqual({
      getTeamDay: 1,
      getLatestWaves: 1,
      getTeamDetail: 1,
      getMyCallbacks: 1,
      getCallTrend: 1,
    })
  })

  it("«Riprova» su una delle tre celle fa una lettura sola", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getTeamDay")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const [, second] = await screen.findAllByText(PARTS[0]!.error)
    await settled()
    const reads = backend.state.reads.getTeamDay
    backend.clearFailure("getTeamDay")

    await userEvent.setup().click(retryOf(second!))

    await waitFor(() => expect(screen.queryByText(PARTS[0]!.error)).toBeNull())
    expect(backend.state.reads.getTeamDay).toBe(reads + 1)
  })
})

describe("AdminHome, le quattro parti (AC30)", () => {
  it.each(PARTS)(
    "$endpoint in caricamento mostra il suo nome, le altre hanno finito",
    async ({ endpoint, cells, loading }) => {
      const backend = fakeAdminHome()
      backend.hold(endpoint)
      renderHome("/dashboard", backend, { role: "ADMIN" })

      await waitFor(() => {
        expect(screen.queryAllByRole("status")).toHaveLength(cells)
      })
      expect(screen.getAllByText(loading)).toHaveLength(cells)
    }
  )

  it.each(PARTS)(
    "$endpoint che fallisce mostra il suo errore e nessun toast, le altre restano",
    async ({ endpoint, cells, error }) => {
      const backend = fakeAdminHome()
      backend.failWith(endpoint)
      renderHome("/dashboard", backend, { role: "ADMIN" })

      expect(await screen.findAllByText(error)).toHaveLength(cells)
      await settled()
      expect(screen.getAllByRole("alert")).toHaveLength(cells)
      expect(toasts()).toHaveLength(0)
    }
  )

  it.each(PARTS)(
    "$endpoint, una rilettura che fallisce mette l'errore al posto dei dati e «Riprova» lo scheletro",
    async ({ endpoint, cells, loading, error }) => {
      const backend = fakeAdminHome()
      const { queryClient } = renderHome("/dashboard", backend, {
        role: "ADMIN",
      })
      await settled()
      const reads = backend.state.reads[endpoint]

      // A read with data on screen shows no skeleton
      const release = backend.hold(endpoint)
      void queryClient.invalidateQueries({ queryKey: adminHomeKeys.all })
      await waitFor(() => expect(backend.state.reads[endpoint]).toBe(reads + 1))
      expect(screen.queryByText(loading)).toBeNull()

      backend.failWith(endpoint)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      const messages = await screen.findAllByText(error)
      expect(messages).toHaveLength(cells)
      expect(toasts()).toHaveLength(0)

      backend.clearFailure(endpoint)
      const answer = backend.hold(endpoint)
      await userEvent.setup().click(retryOf(messages[0]!))

      expect(await screen.findAllByText(loading)).toHaveLength(cells)
      expect(screen.queryByText(error)).toBeNull()

      answer()
      await waitFor(() => expect(screen.queryByText(loading)).toBeNull())
      expect(screen.queryByText(error)).toBeNull()
    }
  )
})

describe("AdminHome, il fuoco dopo «Riprova» (AC49)", () => {
  it("con «Ultimi import» in errore, «Riprova» e dati in arrivo, il fuoco va sul titolo della sezione e le altre parti non si muovono", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getLatestWaves")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const message = await screen.findByText(
      "Non è stato possibile caricare gli ultimi import."
    )
    const retry = within(
      message.closest<HTMLElement>("[role=alert]")!
    ).getByRole("button", { name: "Riprova" })
    const reads = { ...backend.state.reads }

    backend.clearFailure("getLatestWaves")
    await userEvent.setup().click(retry)

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Ultimi import" })
      ).toHaveFocus()
    )
    expect(backend.state.reads).toEqual({
      ...reads,
      getLatestWaves: reads.getLatestWaves + 1,
    })
  })
})

describe("AdminHome, il fuoco quando «Riprova» finisce (AC49)", () => {
  const failed = async (
    section: (typeof SECTIONS)[number],
    backend: ReturnType<typeof fakeAdminHome>
  ) => {
    backend.failWith(section.endpoint)
    renderHome("/dashboard", backend, { role: "ADMIN" })
    return retryOf(await screen.findByText(section.error))
  }

  it.each(SECTIONS)(
    "$title, se fallisce di nuovo il fuoco va sul nuovo «Riprova»",
    async (section) => {
      const backend = fakeAdminHome()
      const retry = await failed(section, backend)
      const release = backend.hold(section.endpoint)

      await userEvent.setup().click(retry)
      await screen.findByText(section.loading)
      expect(document.body).toHaveFocus()
      release()

      const message = await screen.findByText(section.error)
      await waitFor(() => expect(retryOf(message)).toHaveFocus())
      expect(retryOf(message)).not.toBe(retry)
    }
  )

  it.each(SECTIONS)(
    "$title, con il fuoco altrove i dati in arrivo non lo muovono",
    async (section) => {
      const backend = fakeAdminHome()
      const retry = await failed(section, backend)
      backend.clearFailure(section.endpoint)
      const release = backend.hold(section.endpoint)

      await userEvent.setup().click(retry)
      await screen.findByText(section.loading)
      const elsewhere = screen.getByRole("link", { name: "Importa" })
      act(() => elsewhere.focus())
      release()

      await waitFor(() =>
        expect(screen.queryByText(section.loading)).toBeNull()
      )
      expect(elsewhere).toHaveFocus()
    }
  )

  it.each(SECTIONS)(
    "$title, con il fuoco altrove un nuovo fallimento non lo muove",
    async (section) => {
      const backend = fakeAdminHome()
      const retry = await failed(section, backend)
      const release = backend.hold(section.endpoint)

      await userEvent.setup().click(retry)
      await screen.findByText(section.loading)
      const elsewhere = screen.getByRole("link", { name: "Importa" })
      act(() => elsewhere.focus())
      release()

      await screen.findByText(section.error)
      expect(elsewhere).toHaveFocus()
    }
  )

  it("una rilettura che arriva senza «Riprova» non muove il fuoco", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getLatestWaves")
    const { queryClient } = renderHome("/dashboard", backend, { role: "ADMIN" })
    await screen.findByText(SECTIONS[0].error)
    backend.clearFailure("getLatestWaves")

    await act(() =>
      queryClient.invalidateQueries({ queryKey: adminHomeKeys.all })
    )

    await waitFor(() =>
      expect(screen.queryByText(SECTIONS[0].error)).toBeNull()
    )
    expect(document.body).toHaveFocus()
  })

  it("delle tre celle sulla stessa lettura, il fuoco va sull'etichetta di quella cliccata", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getTeamDay")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const [, second] = await screen.findAllByText(PARTS[0]!.error)
    backend.clearFailure("getTeamDay")

    await userEvent.setup().click(retryOf(second!))

    await waitFor(() =>
      // The strip's, not the chart's of «Andamento delle chiamate»
      expect(screen.getAllByText("Tasso di risposta")[0]).toHaveFocus()
    )
  })
})
