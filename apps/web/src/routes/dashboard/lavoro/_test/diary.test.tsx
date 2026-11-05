import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeLavoro, myCall } from "@/test/lavoro"
import { renderLavoro } from "./page"

describe("Fatti oggi", () => {
  it("con una chiamata Richiamare mostra «Richiamo · gg/mm», il messaggio e «Da un alert»", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        calls: [
          myCall({
            outcome: "richiamare",
            callbackDay: "2026-11-05",
            message: "Dopo le 18",
            origin: "alert",
          }),
        ],
      })
    )

    const row = await screen.findByRole("row", { name: /Mario/ })
    expect(row.textContent).toContain("Richiamo · 05/11")
    expect(row.textContent).toContain("Dopo le 18")
    expect(row.textContent).toContain("Da un alert")
  })

  it("mostra ora di Roma, nome con link al contatto, telefono, esito, messaggio e origine nelle colonne", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        calls: [myCall({ id: 1, taskId: 7, outcome: "app.to", message: null })],
      })
    )

    const row = await screen.findByRole("row", { name: /Mario/ })
    const cells = within(row).getAllByRole("cell")
    // 08:30 UTC on 2026-10-15 is 10:30 in Rome (CEST)
    expect(cells[0]?.textContent).toBe("10:30")
    expect(cells[1]?.textContent).toContain("3331234567")
    expect(within(row).getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/contatti/7"
    )
    expect(cells[2]?.textContent).toBe("Appuntamento")
    expect(cells[3]?.textContent).toBe("")
    expect(cells[4]?.textContent).toBe("Dalla lista")
  })

  it("elenca le chiamate nell'ordine ricevuto, la più recente per prima", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        calls: [
          myCall({ id: 2, name: "Luca", surname: "Bianchi" }),
          myCall({ id: 1, name: "Anna", surname: "Verdi" }),
        ],
      })
    )

    await screen.findByRole("row", { name: /Luca/ })
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Luca"),
      expect.stringContaining("Anna"),
    ])
    expect(screen.getByText("2 chiamate, dalla più recente")).toBeVisible()
  })

  it("una riga senza taskId mostra il nome senza link", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        calls: [myCall({ taskId: null as unknown as number })],
      })
    )

    const row = await screen.findByRole("row", { name: /Mario/ })
    expect(within(row).queryByRole("link")).toBeNull()
  })

  it("con 8 righe non c'è «Mostra tutte»; con 9 mostra le prime 8 e il pulsante alterna", async () => {
    const calls = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        myCall({ id: i + 1, taskId: i + 1, name: `Cliente${i + 1}` })
      )
    const eight = renderLavoro("/dashboard", fakeLavoro({ calls: calls(8) }))
    await screen.findByRole("row", { name: /Cliente8/ })
    expect(screen.getAllByRole("row")).toHaveLength(9)
    expect(screen.queryByRole("button", { name: /Mostra/ })).toBeNull()
    eight.unmount()

    const { user } = renderLavoro("/dashboard", fakeLavoro({ calls: calls(9) }))
    await screen.findByRole("row", { name: /Cliente8/ })
    expect(screen.getAllByRole("row")).toHaveLength(9)
    expect(screen.queryByRole("row", { name: /Cliente9/ })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Mostra tutte le 9" }))
    expect(screen.getAllByRole("row")).toHaveLength(10)
    await user.click(
      screen.getByRole("button", { name: "Mostra solo le ultime" })
    )
    expect(screen.getAllByRole("row")).toHaveLength(9)
    expect(
      screen.getByRole("button", { name: "Mostra tutte le 9" })
    ).toBeVisible()
  })

  it("senza chiamate dice che non ce ne sono e non mostra il contatore", async () => {
    renderLavoro("/dashboard", fakeLavoro({ calls: [] }))

    expect(
      await screen.findByText(
        "Nessuna chiamata registrata oggi. Le chiamate che registri compaiono qui, con l'esito e l'ora."
      )
    ).toBeVisible()
    expect(screen.queryByText(/dalla più recente/)).toBeNull()
  })

  it("mentre carica mostra lo scheletro annunciato", async () => {
    const backend = fakeLavoro({ calls: [myCall()] })
    const release = backend.hold("getMyCalls")
    renderLavoro("/dashboard", backend)

    const label = (
      await screen.findAllByText("Caricamento delle chiamate di oggi")
    )[0]
    expect(label).toHaveClass("sr-only")
    expect(label?.closest("[role=status]")).not.toBeNull()
    release()
    await screen.findByRole("row", { name: /Mario/ })
  })

  it("«Vedi le chiamate» dà il fuoco al titolo", async () => {
    const original: unknown = Reflect.get(Element.prototype, "scrollIntoView")
    Element.prototype.scrollIntoView = () => undefined
    try {
      const { user } = renderLavoro(
        "/dashboard",
        fakeLavoro({ calls: [myCall()] })
      )
      await user.click(
        await screen.findByRole("link", { name: "Vedi le chiamate" })
      )
      expect(screen.getByRole("heading", { name: "Fatti oggi" })).toHaveFocus()
    } finally {
      Reflect.set(Element.prototype, "scrollIntoView", original)
    }
  })

  it("se il primo caricamento fallisce mostra l'errore con «Riprova» dentro la sezione", async () => {
    const backend = fakeLavoro({ calls: [myCall()] })
    backend.failWith("getMyCalls", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)

    const section = (
      await screen.findByRole("heading", { name: "Fatti oggi" })
    ).closest("section")!
    const alert = await within(section).findByRole("alert")
    expect(alert.textContent).toContain(
      "Non è stato possibile caricare le chiamate di oggi."
    )
    expect(alert.parentElement).toHaveClass("px-5", "py-3")
    expect(alert).not.toHaveClass("border")

    backend.recover("getMyCalls")
    await user.click(within(alert).getByRole("button", { name: "Riprova" }))
    expect(await screen.findByRole("row", { name: /Mario/ })).toBeVisible()
  })

  it("un aggiornamento fallito lascia le righe con l'errore sopra", async () => {
    const backend = fakeLavoro({ calls: [myCall()] })
    const { queryClient } = renderLavoro("/dashboard", backend)
    await screen.findByRole("row", { name: /Mario/ })

    backend.failWith("getMyCalls", "unavailable")
    await queryClient.invalidateQueries()

    const section = screen
      .getByRole("heading", { name: "Fatti oggi" })
      .closest("section")!
    expect(
      await within(section).findByText(
        /Non è stato possibile caricare le chiamate di oggi/
      )
    ).toBeVisible()
    expect(within(section).getByRole("row", { name: /Mario/ })).toBeVisible()
  })
})
