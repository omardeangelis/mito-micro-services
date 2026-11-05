import { act, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type MyCallback } from "@mito/contract/home"
import { homeKeys } from "@/api/home"
import { fakeLavoro, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

afterEach(() => {
  vi.useRealTimers()
})

const section = () => screen.getByRole("region", { name: "Richiami da fare" })

const linkOf = (alertId: number) =>
  document.querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)!

const rowOf = (alertId: number) => linkOf(alertId).closest("tr")!

/** Renders the rows and waits for the table */
const renderRows = async (...rows: Partial<MyCallback>[]) => {
  const backend = fakeLavoro({
    callbacks: rows.map((row, index) =>
      myCallback({ alertId: index + 1, taskId: 101 + index, ...row })
    ),
  })
  const page = renderLavoro("/dashboard", backend)
  await waitFor(() =>
    expect(document.querySelector("[data-callback-link]")).not.toBeNull()
  )
  return { backend, ...page }
}

describe("Richiami da fare", () => {
  it("con uno scaduto e uno di oggi mostra prima «Scaduti · 1», poi «Di oggi · 1», e in testata «1 scaduto · 1 di oggi»", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        callbacks: [
          myCallback({ alertId: 1, taskId: 101, daysLate: 2 }),
          myCallback({ alertId: 2, taskId: 102, daysLate: 0 }),
        ],
      })
    )

    const overdue = await screen.findByRole("columnheader", {
      name: "Scaduti · 1",
    })
    const today = screen.getByRole("columnheader", { name: "Di oggi · 1" })
    expect(
      overdue.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByText("1 scaduto · 1 di oggi")).toBeTruthy()
  })

  it("le righe stanno sotto la loro intestazione, in una sola tabella", async () => {
    await renderRows(
      { daysLate: 3, name: "Anna", surname: "Bianchi" },
      { daysLate: 1, name: "Bruno", surname: "Verdi" },
      { daysLate: 0, name: "Carla", surname: "Neri" }
    )

    expect(within(section()).getAllByRole("table")).toHaveLength(1)
    const labels = within(section())
      .getAllByRole("row")
      .slice(1)
      .map(
        (row) => within(row).queryByRole("link")?.textContent ?? row.textContent
      )
    expect(labels).toEqual([
      "Scaduti · 2",
      "Anna Bianchi",
      "Bruno Verdi",
      "Di oggi · 1",
      "Carla Neri",
    ])
    expect(screen.getByText("2 scaduti · 1 di oggi")).toBeTruthy()
  })

  it("senza scaduti non c'è il loro gruppo e la testata dice solo «M di oggi»", async () => {
    await renderRows({ daysLate: 0 }, { daysLate: 0 })

    expect(
      screen.getByRole("columnheader", { name: "Di oggi · 2" })
    ).toBeTruthy()
    expect(screen.queryByRole("columnheader", { name: /^Scaduti/ })).toBeNull()
    expect(screen.getByText("2 di oggi")).toBeTruthy()
  })

  it("con soli scaduti non c'è il gruppo di oggi", async () => {
    await renderRows({ daysLate: 1 })

    expect(
      screen.getByRole("columnheader", { name: "Scaduti · 1" })
    ).toBeTruthy()
    expect(screen.queryByRole("columnheader", { name: /^Di oggi/ })).toBeNull()
    expect(screen.getByText("1 scaduto · 0 di oggi")).toBeTruthy()
  })

  it("le colonne sono Cliente, Richiamo, Stato, Registra chiamata, con Stato larga w-36", async () => {
    await renderRows({})

    const headers = within(section())
      .getAllByRole("row")[0]!
      .querySelectorAll("th")
    expect([...headers].map((th) => th.textContent)).toEqual([
      "Cliente",
      "Richiamo",
      "Stato",
      "Registra chiamata",
    ])
    expect(section().querySelectorAll("col")[2]!.className).toBe("w-36")
  })

  it.each([
    [0, "Oggi", "text-tag-amber-text", "lucide-clock"],
    [1, "da ieri", "text-destructive-text", "lucide-triangle-alert"],
    [3, "da 3 giorni", "text-destructive-text", "lucide-triangle-alert"],
  ])(
    "%d giorni di ritardo si leggono «%s»",
    async (daysLate, text, color, icon) => {
      await renderRows({ daysLate })

      const marker = within(rowOf(1)).getByText(text).parentElement!
      expect(marker.className).toContain(color)
      expect(marker.querySelector("svg")!.classList).toContain(icon)
    }
  )

  it("il nome porta al dettaglio del contatto", async () => {
    await renderRows({ alertId: 7, taskId: 321 })

    expect(linkOf(7).getAttribute("href")).toBe("/dashboard/contatti/321")
    expect(linkOf(7).textContent).toBe("Mario Rossi")
  })

  it("sotto il nome ci sono il telefono e il messaggio", async () => {
    await renderRows({ message: "Vuole il preventivo" })

    expect(rowOf(1).textContent).toContain("3331234567 · Vuole il preventivo")
  })

  it("senza messaggio dice «Nessun messaggio» e il link non ha descrizione", async () => {
    await renderRows({})

    expect(rowOf(1).textContent).toContain("3331234567 · Nessun messaggio")
    expect(linkOf(1).hasAttribute("aria-describedby")).toBe(false)
  })

  it("senza telefono la riga mostra solo il messaggio (D19)", async () => {
    await renderRows({ phoneNumber: null, message: "Vuole il preventivo" })

    const line = within(rowOf(1)).getByText("Vuole il preventivo").parentElement
    expect(line!.textContent).toBe("Vuole il preventivo")
  })

  it("senza nome è «Cliente senza nome», anche nel gruppo degli esiti (D19)", async () => {
    await renderRows({ name: null, surname: "  " })

    expect(linkOf(1).textContent).toBe("Cliente senza nome")
    expect(
      screen.getByRole("group", {
        name: "Esito della chiamata a Cliente senza nome",
      })
    ).toBeTruthy()
  })

  it("nome e messaggio lunghi si troncano nella cella, il telefono è prima del messaggio", async () => {
    const message = "Un messaggio molto lungo ".repeat(20).trim()
    await renderRows({ name: "Nome ".repeat(40).trim(), message })

    expect(linkOf(1).className).toContain("truncate")
    const line = within(rowOf(1)).getByText(message).parentElement!
    expect(line.className).toContain("truncate")
    expect(line.firstElementChild!.textContent).toBe("3331234567")
    expect(section().querySelector("table")!.className).toContain("table-fixed")
  })

  it("mostra tutte le 256 righe, senza limite e senza pagine (AC14)", async () => {
    await renderRows(
      ...Array.from({ length: 256 }, (_, index) => ({
        daysLate: index < 100 ? 2 : 0,
      }))
    )

    expect(screen.getByText("100 scaduti · 156 di oggi")).toBeTruthy()
    expect(document.querySelectorAll("[data-callback-link]")).toHaveLength(256)
    expect(screen.queryByRole("button", { name: /pagina/i })).toBeNull()
  }, 20_000)

  it("ogni riga ha i quattro esiti, nel gruppo con il nome del cliente", async () => {
    await renderRows({})

    const group = screen.getByRole("group", {
      name: "Esito della chiamata a Mario Rossi",
    })
    expect(group.getAttribute("data-call-control")).toBe("1")
    expect(within(group).getAllByRole("button")).toHaveLength(4)
  })
})

describe("lo stato e il tentativo (AC15)", () => {
  const NOW = "2026-11-05T10:00:00.000Z"

  it("mostra il badge dello stato", async () => {
    await renderRows({ state: "non risponde" })

    expect(within(rowOf(1)).getAllByText("Non risponde")).toHaveLength(2)
  })

  it("senza un tentativo non dice «tentato»", async () => {
    await renderRows({})

    expect(rowOf(1).textContent).not.toContain("tentato")
  })

  it.each([
    [NOW, "2026-11-05T08:05:00.000Z", "tentato alle 09:05"],
    [NOW, "2026-11-04T08:05:00.000Z", "tentato ieri alle 09:05"],
    [NOW, "2026-11-03T08:05:00.000Z", "tentato 03/11"],
    // A Roma è già il giorno dopo: in UTC e nel browser potrebbe non esserlo
    [
      "2026-11-05T23:30:00.000Z",
      "2026-11-05T22:50:00.000Z",
      "tentato ieri alle 23:50",
    ],
    [
      "2026-11-05T23:30:00.000Z",
      "2026-11-05T23:10:00.000Z",
      "tentato alle 00:10",
    ],
    // Il 25 ottobre 2026 dura 25 ore: ventiquattro ore prima è ancora lo stesso giorno
    [
      "2026-10-25T22:30:00.000Z",
      "2026-10-24T22:30:00.000Z",
      "tentato alle 00:30",
    ],
  ])("alle %s, tentato il %s si legge «%s»", async (now, triedAt, text) => {
    vi.setSystemTime(new Date(now))
    await renderRows({ triedAt: new Date(triedAt) })

    expect(within(rowOf(1)).getByText(text)).toBeTruthy()
  })
})

describe("il messaggio intero (AC15, AC50)", () => {
  const message = "Richiamare dopo le 18, ha chiesto il preventivo ".repeat(4)

  it("è il `title` della riga, per il passaggio del mouse", async () => {
    await renderRows({ message })

    const text = message.trim()
    expect(screen.getByTitle(text).textContent).toContain(text)
  })

  it("è la descrizione accessibile del link, sempre", async () => {
    await renderRows({ message })

    expect(
      screen.getByRole("link", {
        name: "Mario Rossi",
        description: message.trim(),
      })
    ).toBe(linkOf(1))
  })

  it("si legge finché il link ha il fuoco", async () => {
    await renderRows({ message })
    const text = message.trim()

    expect(screen.getAllByText(text)).toHaveLength(1)
    act(() => linkOf(1).focus())
    expect(screen.getAllByText(text)).toHaveLength(2)
    act(() => linkOf(1).blur())
    expect(screen.getAllByText(text)).toHaveLength(1)
  })

  it("si legge arrivando con la tastiera", async () => {
    const { user } = await renderRows({ message })
    const text = message.trim()

    for (let tab = 0; tab < 30 && document.activeElement !== linkOf(1); tab++)
      await user.tab()

    expect(document.activeElement).toBe(linkOf(1))
    expect(screen.getAllByText(text)).toHaveLength(2)
  })
})

describe("senza righe (AC24)", () => {
  it.each([
    [2854, "Puoi partire dai 2.854 contatti da chiamare."],
    [2, "Puoi partire dai 2 contatti da chiamare."],
    [1, "Puoi partire dal contatto da chiamare."],
  ])("con %d da chiamare dice «%s» e apre la lista", async (toCall, text) => {
    renderLavoro("/dashboard", fakeLavoro({ toCall }))

    const hint = await within(section()).findByText(text)
    expect(within(section()).getByText("Nessun richiamo da fare.")).toBeTruthy()
    expect(
      within(hint).getByRole("link", { name: "Apri la lista" })
    ).toBeTruthy()
  })

  it("con zero da chiamare dice che li assegna un amministratore", async () => {
    renderLavoro("/dashboard", fakeLavoro({ toCall: 0 }))

    const hint = await within(section()).findByText(
      "Non hai contatti da chiamare: li assegna un amministratore."
    )
    expect(within(hint).queryByRole("link")).toBeNull()
  })

  it("con il numero in caricamento dice solo «Nessun richiamo da fare.»", async () => {
    const backend = fakeLavoro({ toCall: 3 })
    const release = backend.hold("getMyToCall")
    renderLavoro("/dashboard", backend)

    await within(section()).findByText("Nessun richiamo da fare.")
    expect(within(section()).queryByText(/Puoi partire/)).toBeNull()
    release()
    await within(section()).findByText(/Puoi partire/)
  })

  it("con il numero in errore dice solo «Nessun richiamo da fare.»", async () => {
    const backend = fakeLavoro({ toCall: 3 })
    backend.failWith("getMyToCall", "unavailable")
    renderLavoro("/dashboard", backend)

    await screen.findByText("Non è stato possibile caricare da chiamare.")
    await within(section()).findByText("Nessun richiamo da fare.")
    expect(section().textContent).toBe(
      "Richiami da fareNessun richiamo da fare."
    )
  })

  it("non mostra il conteggio in testata", async () => {
    renderLavoro("/dashboard", fakeLavoro({ toCall: 3 }))

    await within(section()).findByText("Nessun richiamo da fare.")
    expect(within(section()).queryByText(/di oggi/)).toBeNull()
  })
})

describe("caricamento ed errori (AC38, AC39, AC51)", () => {
  it("mentre carica mostra lo scheletro, senza conteggio", async () => {
    const backend = fakeLavoro({ callbacks: [myCallback()] })
    const release = backend.hold("getMyCallbacks")
    renderLavoro("/dashboard", backend)

    const status = await within(section()).findByRole("status")
    expect(status.textContent).toContain("Caricamento dei richiami")
    expect(within(section()).queryByText(/di oggi/)).toBeNull()
    release()
    await screen.findByText("1 di oggi")
  })

  it("le righe arrivano senza aspettare il diario (AC37)", async () => {
    const backend = fakeLavoro({ callbacks: [myCallback()] })
    backend.hold("getMyCalls")
    renderLavoro("/dashboard", backend)

    expect(await screen.findByText("1 di oggi")).toBeTruthy()
  })

  it("se il primo caricamento fallisce dice l'errore, con il margine, e «Riprova» carica le righe", async () => {
    const backend = fakeLavoro({ callbacks: [myCallback()] })
    backend.failWith("getMyCallbacks", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)

    const alert = await within(section()).findByRole("alert")
    expect(alert.textContent).toContain(
      "Non è stato possibile caricare i richiami."
    )
    expect(alert.parentElement!.className).toBe("px-5 py-3")
    expect(within(section()).queryByRole("status")).toBeNull()
    expect(within(section()).queryByText(/di oggi/)).toBeNull()

    backend.recover("getMyCallbacks")
    await user.click(within(alert).getByRole("button", { name: "Riprova" }))

    expect(await screen.findByText("1 di oggi")).toBeTruthy()
    expect(within(section()).queryByRole("alert")).toBeNull()
  })

  it("se fallisce un aggiornamento le righe restano, con l'errore sopra", async () => {
    const { backend, queryClient, user } = await renderRows({}, { daysLate: 1 })

    backend.failWith("getMyCallbacks", "unavailable")
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    const alert = await within(section()).findByRole("alert")
    expect(
      alert.compareDocumentPosition(linkOf(1)) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(alert.parentElement!.className).toBe("px-5 pt-3")
    expect(linkOf(1)).toBeTruthy()

    backend.recover("getMyCallbacks")
    await user.click(within(alert).getByRole("button", { name: "Riprova" }))
    await waitFor(() =>
      expect(within(section()).queryByRole("alert")).toBeNull()
    )
    expect(linkOf(2)).toBeTruthy()
  })
})

describe("le riletture sulla coda (AC23)", () => {
  it("una rilettura del solo diario non cambia una riga già riconciliata", async () => {
    const { backend, queryClient } = await renderRows(
      { message: "Primo" },
      { message: "Secondo" }
    )
    const row = rowOf(1)
    const text = row.textContent

    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.state.callbacks = []
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.calls() })
    )
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(2))

    expect(rowOf(1)).toBe(row)
    expect(row.textContent).toBe(text)
    expect(screen.getByText("2 di oggi")).toBeTruthy()
  })

  it("una riga che non c'è più nelle righe si chiude al suo posto, senza scheletro, e i conteggi scendono", async () => {
    const { backend, queryClient } = await renderRows(
      { daysLate: 1 },
      { daysLate: 0 }
    )
    let skeleton = false
    const observer = new MutationObserver(() => {
      skeleton ||= within(section()).queryByRole("status") !== null
    })
    observer.observe(section(), { childList: true, subtree: true })

    backend.writeElsewhere({ alertId: 1 })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    observer.disconnect()
    expect(skeleton).toBe(false)
    expect(
      screen.getByRole("columnheader", { name: "Scaduti · 0" })
    ).toBeTruthy()
    expect(screen.getByText("1 di oggi")).toBeTruthy()
    expect(screen.queryByRole("group", { name: /^Esito/, hidden: false })).toBe(
      within(rowOf(2)).getByRole("group")
    )
  })

  it("con tutte le righe chiuse la tabella resta e la testata dice «0 di oggi»", async () => {
    const { backend, queryClient } = await renderRows({})

    backend.writeElsewhere({ alertId: 1 })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    expect(
      screen.getByRole("columnheader", { name: "Di oggi · 0" })
    ).toBeTruthy()
    expect(screen.getByText("0 di oggi")).toBeTruthy()
    expect(within(section()).queryByText("Nessun richiamo da fare.")).toBeNull()
  })

  it("una riga aperta si aggiorna al suo posto, e le righe nuove aspettano il prossimo caricamento", async () => {
    const { backend, queryClient } = await renderRows({ state: "chiamare" })
    const row = rowOf(1)

    backend.state.callbacks = [
      { ...backend.state.callbacks[0]!, state: "non risponde" },
      myCallback({ alertId: 2, taskId: 102 }),
    ]
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    await within(row).findByText("Non risponde", {
      selector: "[data-slot=badge]",
    })
    expect(document.querySelectorAll("[data-callback-link]")).toHaveLength(1)
  })
})
