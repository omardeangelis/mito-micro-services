import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Unauthorized } from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type WaveView } from "@/api/import"
import { ada } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"
import { whoHasWork } from "../WhoHasWork"
import { renderWave } from "./page"

type Member = WaveView["team"][number]

const member = (overrides: Partial<Member>): Member => ({
  operatorId: 7,
  name: "Ada Lovelace",
  role: "OPERATORE",
  shown: true,
  pace: 20,
  exactPace: 20.2,
  inactiveDays: null,
  active: 5,
  waveTodo: { toCall: 2, noAnswer: 1 },
  ...overrides,
})

const expiredYesterday = (overrides: Partial<WaveView> = {}) =>
  waveView({
    deadline: "2026-11-03",
    status: "expired",
    workdaysLeft: null,
    daysSinceDeadline: 1,
    team: [
      member({ operatorId: 1, name: "Ada Lovelace" }),
      member({
        operatorId: 2,
        name: "Bruno Neri",
        waveTodo: { toCall: 4, noAnswer: 0 },
      }),
    ],
    ...overrides,
  })

describe("L'avviso della Wave scaduta (AC21)", () => {
  it("su una Wave scaduta ieri con da fare mostra l'avviso, con «Proroga» e «Riassegna»", async () => {
    renderWave(fakeImport({ wave: expiredYesterday() }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(
      "Scaduta ieri con 7 contatti ancora da fare presso 2 operatori. Nessuno è diventato arretrato. Spostare il da fare non cambia la scadenza: per toglierla dalle scadute, proroga."
    )
    expect(
      within(alert).getByRole("button", { name: "Proroga" })
    ).toBeInTheDocument()
    expect(
      within(alert).getByRole("button", { name: "Riassegna" })
    ).toBeInTheDocument()
  })

  it("da due giorni in poi dice «Scaduta da N giorni con»", async () => {
    renderWave(
      fakeImport({
        wave: expiredYesterday({
          deadline: "2026-11-01",
          daysSinceDeadline: 3,
        }),
      })
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^Scaduta da 3 giorni con 7 contatti/
    )
  })

  it("senza da fare, o con la scadenza aperta, non c'è", async () => {
    renderWave(
      fakeImport({
        wave: expiredYesterday({
          team: [member({ waveTodo: { toCall: 0, noAnswer: 0 } })],
        }),
      })
    )
    await screen.findByRole("region", { name: "Panoramica della Wave" })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("La panoramica (AC19)", () => {
  it("la barra ha il nome con tutte le parti e la legenda ha i numeri", async () => {
    renderWave(fakeImport({ wave: waveView() }))

    const bar = await screen.findByRole("img", { name: /Parti della Wave/ })
    expect(bar).toHaveAccessibleName(
      "Parti della Wave: Lavorati 1, Chiamati, senza esito 1, Mai chiamati 3, Senza operatore 4, Con operatore e senza contatto 1"
    )
    const legend = screen.getByRole("list", { name: "Legenda della barra" })
    const items = within(legend)
      .getAllByRole("listitem")
      .map((item) => item.textContent)
    expect(items).toEqual([
      "Lavorati1",
      "Chiamati, senza esito1",
      "Mai chiamati3",
      "Senza operatore4",
    ])
  })

  it("«Assegna» del riquadro apre «Assegna i restanti» su una Wave con la scadenza", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: waveView() }))

    expect(
      await screen.findByText(/4 clienti ancora senza operatore/)
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Assegna" }))

    expect(
      await screen.findByRole("heading", { name: "Assegna i restanti" })
    ).toBeInTheDocument()
  })

  it("«Assegna» del riquadro apre il flusso al primo passo su una Wave da confermare", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({
      wave: waveView({ deadline: null, status: "unconfirmed" }),
    })
    renderWave(backend, { url: "/dashboard/import/5" })
    // «Annulla» leaves the first step on the overview
    await user.click(await screen.findByRole("button", { name: "Annulla" }))
    await user.click(await screen.findByRole("button", { name: "Assegna" }))

    expect(
      await screen.findByRole("heading", { name: "Ingressi e scadenza" })
    ).toBeInTheDocument()
  })

  it("senza clienti da assegnare non c'è il riquadro", async () => {
    renderWave(
      fakeImport({
        wave: waveView({
          toAssign: 0,
          parts: {
            unassigned: 0,
            neverCalled: 3,
            calledNoOutcome: 1,
            worked: 1,
            noContact: 1,
          },
        }),
      })
    )
    await screen.findByRole("region", { name: "Panoramica della Wave" })
    expect(screen.queryByText(/senza operatore$/)).not.toBeInTheDocument()
  })

  it("«Chi ha il da fare»: inattivi prima, poi per da fare, poi per nome; con operatori senza da fare", async () => {
    renderWave(
      fakeImport({
        wave: waveView({
          team: [
            member({
              operatorId: 1,
              name: "Zeno",
              waveTodo: { toCall: 5, noAnswer: 0 },
            }),
            member({
              operatorId: 2,
              name: "Carla",
              waveTodo: { toCall: 9, noAnswer: 1 },
            }),
            member({
              operatorId: 3,
              name: "Anna",
              waveTodo: { toCall: 5, noAnswer: 0 },
            }),
            member({
              operatorId: 4,
              name: "Inattivo",
              inactiveDays: 12,
              waveTodo: { toCall: 2, noAnswer: 3 },
            }),
            member({
              operatorId: 5,
              name: "Libero",
              waveTodo: { toCall: 0, noAnswer: 0 },
            }),
            member({
              operatorId: 6,
              name: "Admin Senza",
              role: "ADMIN",
              waveTodo: { toCall: 0, noAnswer: 0 },
            }),
          ],
        }),
      })
    )

    const list = await screen.findByRole("list", { name: "Chi ha il da fare" })
    const rows = within(list).getAllByRole("listitem")
    expect(
      rows.map((row) => row.querySelector("[data-name]")?.textContent)
    ).toEqual(["Inattivo", "Carla", "Anna", "Zeno", "Libero"])
    expect(rows[0]).toHaveTextContent(
      "inattivo da 12 giorni · 2 da chiamare · 3 non risponde"
    )
    expect(rows[0]).toHaveTextContent("5 da fare")
    expect(rows[1]).toHaveTextContent("10 da fare")
    expect(rows[4]).toHaveTextContent("Niente da fare")
    expect(
      within(rows[4]!).queryByRole("button", { name: /Sposta/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Sposta il da fare di Carla" })
    ).toBeInTheDocument()
  })
})

describe("Dove portano «Riassegna…» e «Sposta» (AC19, AC21)", () => {
  const withInactive = () =>
    waveView({
      team: [
        member({ operatorId: 1, name: "Ada" }),
        member({ operatorId: 4, name: "Inattivo", inactiveDays: 9 }),
      ],
    })

  it("«Riassegna…» e «Sposta» aprono la riassegnazione", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: withInactive() }))

    await user.click(await screen.findByRole("button", { name: "Riassegna…" }))
    expect(
      await screen.findByRole("heading", { name: "Riassegna" })
    ).toBeInTheDocument()
  })

  it("«Sposta» apre la riassegnazione", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: withInactive() }))

    await user.click(
      await screen.findByRole("button", { name: "Sposta il da fare di Ada" })
    )
    expect(
      await screen.findByRole("heading", { name: "Riassegna" })
    ).toBeInTheDocument()
  })

  it("il «Riassegna» dell'avviso apre la riassegnazione", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: expiredYesterday() }))

    const alert = await screen.findByRole("alert")
    await user.click(within(alert).getByRole("button", { name: "Riassegna" }))
    expect(
      await screen.findByRole("heading", { name: "Riassegna" })
    ).toBeInTheDocument()
  })
})

const openExtend = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole("button", { name: "Proroga" })[0]!)
  return screen.findByRole("dialog", { name: "Proroga" })
}

describe("«Proroga» (AC20)", () => {
  it("apre il riquadro con titolo, campo, nota e la data di partenza", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: waveView({ deadline: "2026-11-10" }) }))
    await screen.findByRole("region", { name: "Panoramica della Wave" })

    const dialog = await openExtend(user)
    expect(within(dialog).getByText("Proroga la wave_ottobre")).toBeVisible()
    // today 4/11 + 14 = 18/11, later than 11/11
    expect(
      within(dialog).getByRole("button", { name: "Nuova scadenza, mer 18 nov" })
    ).toBeVisible()
    expect(
      within(dialog).getByText("3 contatti ancora da fare restano a chi li ha.")
    ).toBeVisible()
    expect(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    ).toBeVisible()
  })

  it("salva, chiude e dice il toast con la scadenza di prima", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })

    const dialog = await openExtend(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )

    await waitFor(() =>
      expect(backend.state.deadlines).toEqual([
        { id: 5, input: { deadline: "2026-11-18", kind: "extend" } },
      ])
    )
    expect(
      await screen.findByText(
        "Scadenza della wave_ottobre spostata al mer 18 nov"
      )
    ).toBeVisible()
    expect(screen.getByText("Prima era mar 10 nov.")).toBeVisible()
    expect(
      screen.queryByRole("dialog", { name: "Proroga" })
    ).not.toBeInTheDocument()
  })

  it("il «Prima era» è la scadenza che la pagina aveva, anche se il server risponde a una ripetizione", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    // The server already holds the new day: it answers `before` = the new day
    backend.state.wave = { ...backend.state.wave, deadline: "2026-11-10" }
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })
    const dialog = await openExtend(user)
    // another admin saved the same day meanwhile
    const original = backend.state.wave
    backend.state.wave = { ...original, deadline: "2026-11-18" }
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )

    expect(await screen.findByText("Prima era mar 10 nov.")).toBeVisible()
  })

  it("se fallisce il riquadro resta aperto con la data scelta", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    backend.state.outcome.setDeadline = "deadlineInvalid"
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })

    const dialog = await openExtend(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )

    expect(
      await screen.findByText("Non è stato possibile prorogare. Riprova.")
    ).toBeVisible()
    expect(screen.getByRole("dialog", { name: "Proroga" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Nuova scadenza, mer 18 nov" })
    ).toBeVisible()
  })

  it("con l'esito incerto lo dice e rilegge la Wave", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    backend.state.outcome.setDeadline = "uncertain"
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })
    const reads = backend.asked("wave")

    const dialog = await openExtend(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )

    expect(
      await screen.findByText(
        "Non sappiamo se la proroga è stata salvata. La scadenza qui sopra è riletta."
      )
    ).toBeVisible()
    await waitFor(() => expect(backend.asked("wave")).toBeGreaterThan(reads))
    expect(screen.getByRole("dialog", { name: "Proroga" })).toBeVisible()
  })

  it("dopo un esito incerto, riprovare lo stesso giorno dice ancora la scadenza di prima del primo tentativo", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    backend.state.outcome.setDeadline = "uncertainAfterWrite"
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })

    const dialog = await openExtend(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )
    await screen.findByText(
      "Non sappiamo se la proroga è stata salvata. La scadenza qui sopra è riletta."
    )
    // The re-read shows the new day: the same day is chosen again
    await waitFor(() =>
      expect(screen.getAllByText(/18 nov/).length).toBeGreaterThan(0)
    )
    backend.state.outcome.setDeadline = undefined
    await user.click(
      within(screen.getByRole("dialog", { name: "Proroga" })).getByRole(
        "button",
        { name: "Proroga al 18/11" }
      )
    )

    expect(await screen.findByText("Prima era mar 10 nov.")).toBeVisible()
  })

  it("se la riprova scrive davvero, «Prima era» dice la scadenza che il server ha sostituito", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
    backend.state.outcome.setDeadline = "uncertain"
    renderWave(backend)
    await screen.findByRole("region", { name: "Panoramica della Wave" })

    const dialog = await openExtend(user)
    // Another admin moves the deadline while the page still shows the 10th;
    // the first attempt saves nothing
    backend.state.wave = { ...backend.state.wave, deadline: "2026-11-12" }
    await user.click(
      within(dialog).getByRole("button", { name: "Proroga al 18/11" })
    )
    await screen.findByText(
      "Non sappiamo se la proroga è stata salvata. La scadenza qui sopra è riletta."
    )
    await waitFor(() =>
      expect(screen.getAllByText(/12 nov/).length).toBeGreaterThan(0)
    )
    backend.state.outcome.setDeadline = undefined
    await user.click(
      within(screen.getByRole("dialog", { name: "Proroga" })).getByRole(
        "button",
        { name: "Proroga al 18/11" }
      )
    )

    expect(await screen.findByText("Prima era gio 12 nov.")).toBeVisible()
  })
})

/** A session that the test can end or downgrade after the page has loaded */
const session = () => {
  const state = { now: "admin" as "admin" | "expired" | "operator" }
  // Read at each call: the middleware is built once
  const auth = Layer.succeed(Authenticated)((endpoint) =>
    Effect.gen(function* () {
      if (state.now === "expired") return yield* new Unauthorized()
      return yield* Effect.provideService(endpoint, CurrentUser, {
        operator: ada,
        actor: {
          operatorId: ada.id,
          role: state.now === "operator" ? "OPERATORE" : "ADMIN",
        },
      })
    })
  )
  return { state, auth }
}

describe("«Proroga» rifiutata (AC16, AC20)", () => {
  it.each([
    [
      "expired" as const,
      "La sessione è scaduta: accedi di nuovo. La scadenza non è cambiata.",
    ],
    ["operator" as const, "Solo un admin può cambiare la scadenza."],
  ])(
    "con la sessione %s dice il messaggio e tiene il riquadro",
    async (now, text) => {
      const user = userEvent.setup()
      const backend = fakeImport({ wave: waveView({ deadline: "2026-11-10" }) })
      const { state, auth } = session()
      renderWave(backend, { auth })
      await screen.findByRole("region", { name: "Panoramica della Wave" })

      const dialog = await openExtend(user)
      state.now = now
      await user.click(
        within(dialog).getByRole("button", { name: "Proroga al 18/11" })
      )

      expect(await screen.findByText(text)).toBeVisible()
      expect(screen.getByRole("dialog", { name: "Proroga" })).toBeVisible()
      expect(backend.state.deadlines).toEqual([])
    }
  )
})

describe("L'ordine di «Chi ha il da fare»", () => {
  it("a parità di tutto, due persone con lo stesso nome vanno nell'ordine dell'id utente, qualunque sia l'ordine di arrivo", () => {
    // The lower operator id has the higher user id (Definizioni, «in ordine di nome»)
    const a = member({ operatorId: 3, userId: "user-b", name: "Ada Lovelace" })
    const b = member({ operatorId: 9, userId: "user-a", name: "Ada Lovelace" })
    expect(whoHasWork([b, a]).map((m) => m.operatorId)).toEqual([9, 3])
    expect(whoHasWork([a, b]).map((m) => m.operatorId)).toEqual([9, 3])
  })
})
