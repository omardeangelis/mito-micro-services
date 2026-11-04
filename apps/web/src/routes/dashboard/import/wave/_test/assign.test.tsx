import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Unauthorized } from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type WaveView } from "@/api/import"
import { ada } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"
import { dayText } from "../_lib/text"
import { member } from "../split/_test/harness"
import { renderWave } from "./page"

type User = ReturnType<typeof userEvent.setup>
type Backend = ReturnType<typeof fakeImport>

const summary = () => document.querySelector('[aria-live="polite"]')
const toasts = () =>
  Array.from(document.querySelectorAll("[data-sonner-toast]")).map(
    (toast) => toast.textContent
  )

const NUMBERS_CHANGED =
  "I numeri sono cambiati: controlla l'anteprima e conferma di nuovo."
const UNCERTAIN =
  "Non sappiamo se l'operazione è andata a buon fine. I numeri qui sopra sono aggiornati: controlla l'anteprima prima di confermare di nuovo."

/** Opens «Assegna i restanti» from the box of the overview */
async function openAssign(user: User) {
  await screen.findByRole("region", { name: "Panoramica della Wave" })
  await user.click(screen.getByRole("button", { name: "Assegna" }))
  await screen.findByRole("heading", { name: "Assegna i restanti" })
}

/**
 * The session of the backend, which the test can end, downgrade or hold:
 * while held, every call waits for `release`
 */
const session = () => {
  let held: Promise<void> | null = null
  const state = {
    now: "admin" as "admin" | "expired" | "operator",
    release: () => undefined as void,
    hold: () => {
      held = new Promise<void>((resolve) => {
        state.release = () => {
          held = null
          resolve()
        }
      })
    },
  }
  const auth = Layer.succeed(Authenticated)((endpoint) =>
    Effect.gen(function* () {
      if (held !== null) {
        const wait = held
        yield* Effect.promise(() => wait)
      }
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

/**
 * The fake's `assign` leaves 0 to assign: here it leaves `remaining`, as
 * when «Quanti» was below the maximum
 */
function leaveRemaining(backend: Backend, remaining: number) {
  let wave = backend.state.wave
  Object.defineProperty(backend.state, "wave", {
    get: () => wave,
    set: (next: WaveView) => {
      wave =
        next.toAssign === 0
          ? {
              ...next,
              toAssign: remaining,
              parts: { ...next.parts, unassigned: remaining },
            }
          : next
    },
  })
}

describe("La conferma di «Assegna»: gli esiti di AC16", () => {
  it("con `NumbersChanged` rilegge, dice «I numeri sono cambiati…» e il pulsante è attivo sull'anteprima riletta", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "numbersChanged"
    renderWave(backend)
    await openAssign(user)

    backend.state.wave = { ...backend.state.wave, toAssign: 3 }
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() => expect(summary()).toHaveTextContent(NUMBERS_CHANGED))
    expect(
      screen.getByRole("button", { name: "Assegna 3 a 1 operatore" })
    ).toBeEnabled()
    expect(toasts()).toEqual([])
  })

  it("con `NumbersChanged` e un'anteprima riletta non valida dice il messaggio di AC14", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "numbersChanged"
    renderWave(backend)
    await openAssign(user)

    backend.state.wave = { ...backend.state.wave, toAssign: 0 }
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Nessun cliente della Wave senza operatore"
      )
    )
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled()
  })

  it("dopo `NumbersChanged` con un massimo riletto più basso, «Quanti» non toccato mostra il nuovo massimo (AC13)", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 5026 }) })
    backend.state.outcome.assign = "numbersChanged"
    renderWave(backend)
    await openAssign(user)
    expect(screen.getByRole("textbox", { name: "Quanti" })).toHaveValue("5.026")

    backend.state.wave = { ...backend.state.wave, toAssign: 4000 }
    await user.click(
      screen.getByRole("button", { name: "Assegna 5.026 a 1 operatore" })
    )

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Quanti" })).toHaveValue(
        "4.000"
      )
    )
    expect(
      screen.getByRole("button", { name: "Assegna 4.000 a 1 operatore" })
    ).toBeEnabled()
  })

  it("un altro errore dichiarato dice «Non è stato possibile completare l'operazione. Riprova.» con il pulsante attivo", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "requestIdConflict"
    renderWave(backend)
    await openAssign(user)

    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Non è stato possibile completare l'operazione. Riprova."
      )
    )
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    ).toBeEnabled()
    expect(toasts()).toEqual([])
  })

  it("un esito incerto rilegge e dice «Non sappiamo se…» con il pulsante attivo sull'anteprima riletta", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "uncertain"
    renderWave(backend)
    await openAssign(user)
    const reads = backend.asked("wave")

    backend.state.wave = { ...backend.state.wave, toAssign: 2 }
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() => expect(summary()).toHaveTextContent(UNCERTAIN))
    expect(backend.asked("wave")).toBeGreaterThan(reads)
    expect(
      screen.getByRole("button", { name: "Assegna 2 a 1 operatore" })
    ).toBeEnabled()
  })

  it("la sessione scaduta dice «La sessione è scaduta…» e la conferma resta disattivata finché il passo è aperto", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    const { state, auth } = session()
    renderWave(backend, { auth })
    await openAssign(user)

    state.now = "expired"
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "La sessione è scaduta: accedi di nuovo. Nessun contatto è cambiato."
      )
    )
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    ).toBeDisabled()
    await user.click(screen.getByRole("radio", { name: /In parti uguali/ }))
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    ).toBeDisabled()
    expect(summary()).toHaveTextContent("La sessione è scaduta")
    expect(backend.state.assigns).toEqual([])
  })

  it("un utente `OPERATORE` ha «Solo un admin può assegnare contatti.» e la conferma disattivata", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    const { state, auth } = session()
    renderWave(backend, { auth })
    await openAssign(user)

    state.now = "operator"
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Solo un admin può assegnare contatti."
      )
    )
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    ).toBeDisabled()
    expect(backend.state.assigns).toEqual([])
  })

  it("la rilettura fallita dice «Non è stato possibile rileggere i numeri.» con «Riprova», e la conferma torna attiva quando riesce", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "numbersChanged"
    renderWave(backend)
    await openAssign(user)

    backend.state.outcome.wave = "uncertain"
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Non è stato possibile rileggere i numeri."
      )
    )
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    ).toBeDisabled()

    delete backend.state.outcome.wave
    backend.state.wave = { ...backend.state.wave, toAssign: 3 }
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await waitFor(() => expect(summary()).toHaveTextContent(NUMBERS_CHANGED))
    expect(
      screen.getByRole("button", { name: "Assegna 3 a 1 operatore" })
    ).toBeEnabled()
  })

  it("un messaggio resta finché l'admin non cambia una scelta", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "requestIdConflict"
    renderWave(backend)
    await openAssign(user)

    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )
    await waitFor(() =>
      expect(summary()).toHaveTextContent("Non è stato possibile completare")
    )

    await user.click(screen.getByRole("radio", { name: /In parti uguali/ }))
    expect(summary()).toHaveTextContent("4 · dopo, 9 da fare")
  })
})

describe("Mentre la conferma è in corso (AC15)", () => {
  it("il pulsante dice «Assegnazione in corso…» ed è disattivato, i campi e «Annulla» sono fermi, e non parte una seconda conferma", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    const { state, auth } = session()
    renderWave(backend, { auth })
    await openAssign(user)

    state.hold()
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    const pending = await screen.findByRole("button", {
      name: "Assegnazione in corso…",
    })
    expect(pending).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "Quanti" })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Annulla/ })).toBeDisabled()
    await user.click(pending)

    state.release()
    await screen.findByRole("heading", {
      name: "Assegnati 4 clienti della wave_ottobre",
    })
    expect(backend.state.assigns).toHaveLength(1)
  })
})

describe("Due conferme nello stesso istante (AC15)", () => {
  it("due clic nello stesso turno mandano una sola richiesta", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    const { state, auth } = session()
    renderWave(backend, { auth })
    await openAssign(user)

    state.hold()
    const button = screen.getByRole("button", {
      name: "Assegna 4 a 1 operatore",
    })
    fireEvent.click(button)
    fireEvent.click(button)

    state.release()
    await screen.findByRole("heading", {
      name: "Assegnati 4 clienti della wave_ottobre",
    })
    expect(backend.state.assigns).toHaveLength(1)
  })
})

describe("Il `requestId` (D4, D17)", () => {
  it("dopo un esito incerto la stessa anteprima riusa il `requestId`; un'anteprima diversa ne prende uno nuovo", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "uncertain"
    renderWave(backend)
    await openAssign(user)

    const confirm = () =>
      user.click(
        screen.getByRole("button", { name: /^Assegna \d+ a 1 operatore$/ })
      )
    await confirm()
    await waitFor(() => expect(summary()).toHaveTextContent(UNCERTAIN))
    await confirm()
    await waitFor(() => expect(backend.state.assigns).toHaveLength(2))
    await waitFor(() => expect(summary()).toHaveTextContent(UNCERTAIN))

    const quanti = screen.getByRole("textbox", { name: "Quanti" })
    await user.clear(quanti)
    await user.type(quanti, "2")
    await confirm()
    await waitFor(() => expect(backend.state.assigns).toHaveLength(3))

    const [first, second, third] = backend.state.assigns.map(
      (call) => call.input.requestId
    )
    expect(second).toBe(first)
    expect(third).not.toBe(first)
  })

  it("una conferma nuova dopo un altro esito prende un `requestId` nuovo", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "requestIdConflict"
    renderWave(backend)
    await openAssign(user)

    const button = () =>
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    await user.click(button())
    await waitFor(() => expect(button()).toBeEnabled())
    await user.click(button())
    await waitFor(() => expect(backend.state.assigns).toHaveLength(2))

    const [first, second] = backend.state.assigns.map(
      (call) => call.input.requestId
    )
    expect(second).not.toBe(first)
  })
})

describe("La schermata di fine (AC17)", () => {
  it("dopo una conferma riuscita: «Assegnati 342 clienti della <nome>», la scadenza, il fuoco sul titolo e nessun toast", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 342 }) })
    renderWave(backend)
    await openAssign(user)

    await user.click(
      screen.getByRole("button", { name: "Assegna 342 a 1 operatore" })
    )

    const title = await screen.findByRole("heading", {
      name: "Assegnati 342 clienti della wave_ottobre",
    })
    await waitFor(() => expect(title).toHaveFocus())
    expect(
      screen.getByText(
        `Scadenza ${dayText("2026-11-20")}. Li trovano in Da chiamare.`
      )
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /Assegna i restanti/ })
    ).not.toBeInTheDocument()
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(within(done).queryByRole("button", { name: "Proroga" })).toBeNull()
    expect(toasts()).toEqual([])
    expect(backend.state.assigns[0]?.input.receivers).toEqual([
      { operatorId: 7, count: 342 },
    ])

    await user.click(screen.getByRole("button", { name: "Vai alla Wave" }))
    expect(
      await screen.findByRole("region", { name: "Panoramica della Wave" })
    ).toBeInTheDocument()
  })

  it("con un cliente solo dice «Assegnato 1 cliente» (AC36)", async () => {
    const user = userEvent.setup()
    renderWave(fakeImport({ wave: waveView({ toAssign: 1 }) }))
    await openAssign(user)

    await user.click(
      screen.getByRole("button", { name: "Assegna 1 a 1 operatore" })
    )

    expect(
      await screen.findByRole("heading", {
        name: "Assegnato 1 cliente della wave_ottobre",
      })
    ).toBeInTheDocument()
  })

  it("se restano clienti senza operatore: «Restano 2.026 senza operatore.» e «Assegna i restanti 2.026», che riapre il passo", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 5026 }) })
    renderWave(backend)
    await openAssign(user)
    leaveRemaining(backend, 2026)

    const quanti = screen.getByRole("textbox", { name: "Quanti" })
    await user.clear(quanti)
    await user.type(quanti, "3000")
    await user.click(
      screen.getByRole("button", { name: "Assegna 3.000 a 1 operatore" })
    )

    await screen.findByRole("heading", { name: /^Assegnati/ })
    expect(
      screen.getByText(
        `Scadenza ${dayText("2026-11-20")}. Li trovano in Da chiamare. Restano 2.026 senza operatore.`
      )
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Assegna i restanti 2.026" })
    )
    await screen.findByRole("heading", { name: "Assegna i restanti" })
    expect(screen.getByRole("textbox", { name: "Quanti" })).toHaveValue("2.026")
  })

  it("su una Wave scaduta il testo comincia con «La Wave è scaduta il <giorno>.» e c'è «Proroga»", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({
      wave: waveView({
        toAssign: 4,
        deadline: "2026-11-03",
        status: "expired",
        workdaysLeft: null,
        daysSinceDeadline: 1,
      }),
    })
    renderWave(backend)
    await openAssign(user)

    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )

    const title = await screen.findByRole("heading", {
      name: "Assegnati 4 clienti della wave_ottobre",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(
      within(done).getByText(
        `La Wave è scaduta il ${dayText("2026-11-03")}. Li trovano in Da chiamare.`
      )
    ).toBeVisible()
    expect(
      within(done).getByRole("button", { name: "Proroga" })
    ).toBeInTheDocument()
    expect(
      within(done).getByRole("button", { name: "Vai alla Wave" })
    ).toBeInTheDocument()
  })

  it("dopo «Proroga» dalla schermata di fine «La Wave è scaduta il…» e «Proroga» spariscono", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({
      wave: waveView({
        toAssign: 4,
        deadline: "2026-11-03",
        status: "expired",
        workdaysLeft: null,
        daysSinceDeadline: 1,
      }),
    })
    renderWave(backend)
    await openAssign(user)
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )
    const title = await screen.findByRole("heading", {
      name: "Assegnati 4 clienti della wave_ottobre",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(within(done).getByText(/La Wave è scaduta il/)).toBeVisible()

    await user.click(within(done).getByRole("button", { name: "Proroga" }))
    const dialog = await screen.findByRole("dialog", { name: "Proroga" })
    await user.click(
      within(dialog).getByRole("button", { name: /^Proroga al / })
    )

    await waitFor(() =>
      expect(within(done).queryByText(/La Wave è scaduta il/)).toBeNull()
    )
    expect(within(done).queryByRole("button", { name: "Proroga" })).toBeNull()
    expect(within(done).getByText(/^Scadenza .* Li trovano/)).toBeVisible()
    expect(title).toBeInTheDocument()
  })
})

describe("Lasciare la pagina durante la conferma (AC16, D18)", () => {
  const leave = async (backend: Backend) => {
    const user = userEvent.setup()
    const { state, auth } = session()
    const { router } = renderWave(backend, { auth })
    await openAssign(user)
    state.hold()
    await user.click(
      screen.getByRole("button", { name: "Assegna 4 a 1 operatore" })
    )
    await screen.findByRole("button", { name: "Assegnazione in corso…" })
    await router.navigate("/dashboard/import")
    await screen.findByText("Storico degli import")
    state.release()
  }

  it("riuscita: il toast «Assegnati <N> clienti della <nome>»", async () => {
    await leave(fakeImport({ wave: waveView({ toAssign: 4 }) }))
    expect(
      await screen.findByText("Assegnati 4 clienti della wave_ottobre")
    ).toBeInTheDocument()
  })

  it("esito incerto: il toast «Non sappiamo se l'operazione sulla <nome> è andata a buon fine…»", async () => {
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "uncertain"
    await leave(backend)
    expect(
      await screen.findByText(
        "Non sappiamo se l'operazione sulla wave_ottobre è andata a buon fine: controlla i numeri nella sua pagina."
      )
    ).toBeInTheDocument()
  })

  it("altro esito: il toast «La <nome> non è cambiata.»", async () => {
    const backend = fakeImport({ wave: waveView({ toAssign: 4 }) })
    backend.state.outcome.assign = "numbersChanged"
    await leave(backend)
    expect(
      await screen.findByText("La wave_ottobre non è cambiata.")
    ).toBeInTheDocument()
  })
})

describe("`?per` lascia l'indirizzo (D9)", () => {
  const team = [
    member(7, "Ada Lovelace", { pace: 3, exactPace: 3, active: 4 }),
    member(8, "Bruno Rossi", { pace: 1, exactPace: 1, active: 2 }),
  ]
  const checked = () => ({
    ada: screen.getByRole("checkbox", { name: "Ada Lovelace" }),
    bruno: screen.getByRole("checkbox", { name: "Bruno Rossi" }),
  })

  it("dopo una conferma riuscita, sostituendo la voce della cronologia; poi «Assegna i restanti» sceglie gli `OPERATORE` attivi", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({ wave: waveView({ toAssign: 30, team }) })
    const { router } = renderWave(backend, {
      url: "/dashboard/import/5?per=8&da=import",
    })
    await screen.findByRole("heading", { name: "Assegna i restanti" })
    leaveRemaining(backend, 18)

    await user.type(screen.getByRole("textbox", { name: "Quanti" }), "12")
    await user.click(
      screen.getByRole("button", { name: "Assegna 12 a 1 operatore" })
    )
    await screen.findByRole("heading", { name: /^Assegnati/ })

    expect(router.state.location.search).toBe("?da=import")
    expect(router.state.historyAction).toBe("REPLACE")
    await user.click(
      screen.getByRole("button", { name: "Assegna i restanti 18" })
    )
    await screen.findByRole("heading", { name: "Assegna i restanti" })
    expect(checked().ada).toBeChecked()
    expect(checked().bruno).toBeChecked()
    expect(screen.getByRole("textbox", { name: "Quanti" })).toHaveValue("18")
  })

  it("con «Annulla»; poi «Assegna» della panoramica sceglie gli `OPERATORE` attivi", async () => {
    const user = userEvent.setup()
    const { router } = renderWave(
      fakeImport({ wave: waveView({ toAssign: 30, team }) }),
      { url: "/dashboard/import/5?per=8" }
    )
    await screen.findByRole("heading", { name: "Assegna i restanti" })

    await user.click(screen.getByRole("button", { name: /Annulla/ }))

    expect(router.state.location.search).toBe("")
    expect(router.state.historyAction).toBe("REPLACE")
    await openAssign(user)
    expect(checked().ada).toBeChecked()
    expect(checked().bruno).toBeChecked()
  })

  it("con «Vai alla Wave» della schermata di fine", async () => {
    const user = userEvent.setup()
    const { router } = renderWave(
      fakeImport({
        wave: waveView({ toAssign: 0, deadline: null, status: "open", team }),
      }),
      { url: "/dashboard/import/5?per=8" }
    )

    await user.click(
      await screen.findByRole("button", { name: "Conferma la scadenza" })
    )
    await user.click(
      await screen.findByRole("button", { name: "Vai alla Wave" })
    )

    await screen.findByRole("region", { name: "Panoramica della Wave" })
    expect(router.state.location.search).toBe("")
  })
})
