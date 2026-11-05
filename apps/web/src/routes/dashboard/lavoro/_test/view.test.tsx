import { act, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeHome } from "@/test/home"
import { fakeLavoro, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

describe("la vista dell'operatore", () => {
  it("un OPERATORE su /dashboard vede «Buongiorno, Ada» e «Il mio oggi», non «Analisi Andamento»", async () => {
    renderLavoro("/dashboard", fakeLavoro({ operatorName: "Ada Neri" }))

    expect(
      await screen.findByRole("heading", { name: "Buongiorno, Ada" })
    ).toBeTruthy()
    expect(screen.getByText("Il mio oggi")).toBeTruthy()
    expect(screen.queryByText("Analisi Andamento")).toBeNull()
  })

  it.each([
    "/dashboard?tf=90d",
    "/dashboard/lavoro",
    "/dashboard/lavoro?tf=90d",
  ])(
    "un OPERATORE su %s vede la vista, senza «Analisi Andamento» né il periodo",
    async (path) => {
      const home = fakeHome()
      renderLavoro(path, fakeLavoro(), { alsoServe: home.handlers })

      expect(await screen.findByText("Il mio oggi")).toBeTruthy()
      expect(screen.getByText("Da chiamare")).toBeTruthy()
      expect(screen.getByText("Richiami da fare")).toBeTruthy()
      expect(screen.getByText("Fatti oggi")).toBeTruthy()
      expect(screen.queryByText("Analisi Andamento")).toBeNull()
      expect(screen.queryByText("Ultime Pratiche Aggiornate")).toBeNull()
      expect(screen.queryByText("Chiamate per operatore")).toBeNull()
      expect(screen.queryByRole("combobox")).toBeNull()
      expect(home.state.averageReads).toEqual([])
    }
  )

  it("un ADMIN su /dashboard/lavoro vede la stessa vista, con i propri dati", async () => {
    const backend = fakeLavoro({ role: "ADMIN", toCall: 12 })
    renderLavoro("/dashboard/lavoro", backend, { role: "ADMIN" })

    expect(
      await screen.findByRole("heading", { name: "Buongiorno, Ada" })
    ).toBeTruthy()
    expect(await screen.findByText("12")).toBeTruthy()
    expect(screen.queryByText("Analisi Andamento")).toBeNull()
  })

  it("un ADMIN su /dashboard vede la home di oggi e non chiede nulla della vista", async () => {
    const backend = fakeLavoro({ role: "ADMIN" })
    renderLavoro("/dashboard", backend, {
      role: "ADMIN",
      alsoServe: fakeHome().handlers,
    })

    expect(await screen.findByText("Analisi Andamento")).toBeTruthy()
    expect(await screen.findByText("Contatti con esito")).toBeTruthy()
    expect(screen.queryByText("Il mio oggi")).toBeNull()
    expect(backend.state.reads.getMyDay).toBe(0)
    expect(backend.state.reads.getMyToCall).toBe(0)
  })

  it("con il ruolo ancora ignoto e `/me` in corso non mostra nulla e non lancia le letture", async () => {
    const backend = fakeLavoro()
    const release = backend.hold("getCurrentUser")
    renderLavoro("/dashboard", backend, { role: undefined })

    await waitFor(() => expect(backend.state.reads.getCurrentUser).toBe(1))
    expect(screen.queryByText("Il mio oggi")).toBeNull()
    expect(screen.queryByText("Analisi Andamento")).toBeNull()
    expect(backend.state.reads.getMyDay).toBe(0)
    release()
  })

  it("con `/me` in errore vede la vista, «Buongiorno» e non la pagina d'errore", async () => {
    const backend = fakeLavoro({ toCall: 3 })
    backend.failWith("getCurrentUser", "unavailable")
    renderLavoro("/dashboard", backend, { role: undefined })

    expect(
      await screen.findByRole("heading", { name: "Buongiorno" })
    ).toBeTruthy()
    expect(await screen.findByText("3")).toBeTruthy()
    expect(screen.queryByText("errore della rotta")).toBeNull()
  })

  it("con `/me` in errore la vista resta montata: non rilegge `/me` a ogni montaggio", async () => {
    const backend = fakeLavoro({ toCall: 3 })
    backend.failWith("getCurrentUser", "unavailable")
    renderLavoro("/dashboard", backend, { role: undefined })
    await screen.findByText("3")
    const reads = backend.state.reads

    await new Promise((resolve) => setTimeout(resolve, 50))

    // The three retries of the first read, and no more
    expect(reads.getCurrentUser).toBe(4)
    expect(reads.getMyToCall).toBe(1)
  })

  it("un ADMIN al primo caricamento vede la sua home e la vista non parte mai", async () => {
    const backend = fakeLavoro({ role: "ADMIN" })
    renderLavoro("/dashboard", backend, {
      role: undefined,
      realProvider: true,
      alsoServe: fakeHome().handlers,
    })

    expect(await screen.findByText("Analisi Andamento")).toBeTruthy()
    expect(screen.queryByText("Il mio oggi")).toBeNull()
    expect(backend.state.reads.getMyDay).toBe(0)
    expect(backend.state.reads.getMyCallbacks).toBe(0)
  })

  it("con `/me` che si riprende per un ADMIN la vista lascia il posto alla sua home", async () => {
    const backend = fakeLavoro({ role: "ADMIN", toCall: 3 })
    backend.failWith("getCurrentUser", "unavailable")
    renderLavoro("/dashboard", backend, {
      role: undefined,
      realProvider: true,
      alsoServe: fakeHome().handlers,
    })
    await screen.findByText("3")

    backend.recover("getCurrentUser")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
    })

    expect(await screen.findByText("Analisi Andamento")).toBeTruthy()
    expect(screen.queryByText("Il mio oggi")).toBeNull()
  })

  it("`/me` che si riprende al ritorno alla scheda non smonta la vista: la riga chiusa resta e le righe non ripartono (AC23, AC36)", async () => {
    const backend = fakeLavoro({
      toCall: 3,
      callbacks: [
        myCallback({ alertId: 1, taskId: 101 }),
        myCallback({ alertId: 2, taskId: 102 }),
      ],
    })
    backend.failWith("getCurrentUser", "unavailable")
    const { user } = renderLavoro("/dashboard", backend, {
      role: undefined,
      realProvider: true,
    })
    const section = await screen.findByRole("region", {
      name: "Richiami da fare",
    })
    const rowOf = (alertId: number) =>
      document
        .querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)!
        .closest("tr")!
    await waitFor(() =>
      expect(document.querySelector("[data-callback-link]")).not.toBeNull()
    )
    await user.click(
      within(within(rowOf(1)).getByRole("group")).getByRole("button", {
        name: "Appuntamento",
      })
    )
    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    const reads = backend.state.reads.getMyCallbacks

    backend.recover("getCurrentUser")
    const meReads = backend.state.reads.getCurrentUser
    const release = backend.hold("getCurrentUser")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
    })

    // While it reads: with no data the query is back to pending
    await waitFor(() =>
      expect(backend.state.reads.getCurrentUser).toBe(meReads + 1)
    )
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
    expect(section.isConnected).toBe(true)

    release()

    await screen.findByRole("heading", { name: "Buongiorno, Ada" })
    expect(section.isConnected).toBe(true)
    expect(rowOf(1).textContent).toContain("Appuntamento registrato alle ")
    // The read of the return to the tab, and none of a new mount
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
    expect(backend.state.reads.getMyCallbacks).toBe(reads + 1)
  })
})
