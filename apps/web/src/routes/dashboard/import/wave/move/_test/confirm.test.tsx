import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Unauthorized } from "@mito/contract/errors"
import { type MoveCandidates } from "@mito/contract/import"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type WaveView } from "@/api/import"
import { ada } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"
import { renderWave } from "../../_test/page"

type Member = WaveView["team"][number]
type User = ReturnType<typeof userEvent.setup>
type Backend = ReturnType<typeof fakeImport>

const member = (
  operatorId: number,
  name: string,
  overrides: Partial<Member> = {}
): Member => ({
  operatorId,
  name,
  role: "OPERATORE",
  shown: true,
  pace: 10,
  exactPace: 10,
  inactiveDays: null,
  active: 0,
  waveTodo: { toCall: 0, noAnswer: 0 },
  ...overrides,
})

/** `toCall` contacts in Da chiamare, then `noAnswer` in Non risponde, ids from `first` */
const contactsOf = (
  operatorId: number,
  toCall: number,
  noAnswer: number,
  first = operatorId * 1000
): MoveCandidates["candidates"][number] => ({
  operatorId,
  contacts: [
    ...Array.from({ length: toCall }, (_, i) => ({
      taskId: first + i,
      state: "toCall" as const,
    })),
    ...Array.from({ length: noAnswer }, (_, i) => ({
      taskId: first + toCall + i,
      state: "noAnswer" as const,
    })),
  ],
})

const summary = () => document.querySelector('[aria-live="polite"]')
const toasts = () =>
  Array.from(document.querySelectorAll("[data-sonner-toast]")).map(
    (toast) => toast.textContent
  )

const NUMBERS_CHANGED =
  "I numeri sono cambiati: controlla l'anteprima e conferma di nuovo."
const NOTHING_TO_MOVE =
  "Nessuno dei contatti scelti si può più spostare: nel frattempo hanno avuto un esito o sono passati a un altro operatore."
const UNCERTAIN =
  "Non sappiamo se l'operazione è andata a buon fine. I numeri qui sopra sono aggiornati: controlla l'anteprima prima di confermare di nuovo."
const SKIPPED =
  "nel frattempo hanno avuto un esito o sono passati a un altro operatore."

const wave = (overrides: Partial<WaveView> = {}) =>
  waveView({
    team: [
      member(1, "Ada Lovelace", { active: 4 }),
      member(3, "Carla Bianchi", {
        inactiveDays: 9,
        waveTodo: { toCall: 200, noAnswer: 100 },
      }),
      member(4, "Dario Verdi", {
        inactiveDays: 12,
        waveTodo: { toCall: 100, noAnswer: 0 },
      }),
    ],
    ...overrides,
  })

/** Carla (300) and Dario (100), both inactive, and Ada active */
const carlaAndDario = (overrides: Partial<WaveView> = {}) =>
  fakeImport({
    wave: wave(overrides),
    candidates: [contactsOf(3, 200, 100), contactsOf(4, 100, 0)],
  })

/** «Riassegna…», the two «Avanti», to «A chi» with «Tutti» */
async function toConfirm(user: User) {
  await user.click(await screen.findByRole("button", { name: "Riassegna…" }))
  await user.click(screen.getByRole("button", { name: "Avanti" }))
  await screen.findByRole("region", { name: "Quanti contatti" })
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
  )
  await user.click(screen.getByRole("button", { name: "Avanti" }))
  await screen.findByRole("heading", { name: "A chi" })
}

const confirmButton = (
  name: string | RegExp = /^Sposta\s[\d.]+\sa\s\d+\soperator[ei]$/
) => screen.getByRole("button", { name })

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

describe("La schermata di fine di «Sposta» (AC27)", () => {
  it("con `move` che risponde `{ moved: 199, skipped: 1 }` dice «Spostati 199 contatti» e finisce con «1 non spostato: …»", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.moveResult = { moved: 199, skipped: 1 }
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    const title = await screen.findByRole("heading", {
      name: "Spostati 199 contatti",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(within(done).getByText(/non spostato/)).toHaveTextContent(
      `Da Carla e Dario a 1 operatore. Stato, alert e chat restano come sono. 1 non spostato: ${SKIPPED}`
    )
  })

  it("con un solo contatto dice «Spostato 1 contatto» e «1 non spostato» (AC36)", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.moveResult = { moved: 1, skipped: 1 }
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    const title = await screen.findByRole("heading", {
      name: "Spostato 1 contatto",
    })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByText(/non spostato/)).toHaveTextContent(
      `1 non spostato: ${SKIPPED}`
    )
    expect(toasts()).toEqual([])
  })

  it("senza saltati il testo finisce con «restano come sono.» e «Vai alla Wave» riporta alla panoramica, senza «Proroga»", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())
    await toConfirm(user)

    await user.click(confirmButton())

    const title = await screen.findByRole("heading", {
      name: "Spostati 400 contatti",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(
      within(done).getByText(
        "Da Carla e Dario a 1 operatore. Stato, alert e chat restano come sono."
      )
    ).toBeVisible()
    expect(within(done).queryByRole("button", { name: "Proroga" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Vai alla Wave" }))
    expect(
      await screen.findByRole("region", { name: "Panoramica della Wave" })
    ).toBeInTheDocument()
  })

  it("con due che ricevono dice «a 2 operatori»", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({
      wave: wave({
        team: [
          member(1, "Ada Lovelace", { active: 4 }),
          member(2, "Elena Neri", { active: 4 }),
          member(3, "Carla Bianchi", {
            inactiveDays: 9,
            waveTodo: { toCall: 20, noAnswer: 0 },
          }),
        ],
      }),
      candidates: [contactsOf(3, 20, 0)],
    })
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    expect(await screen.findByText(/^Da Carla a 2 operatori\./)).toBeVisible()
  })

  it("con due che cedono con lo stesso nome usa nome e cognome", async () => {
    const user = userEvent.setup()
    const backend = fakeImport({
      wave: wave({
        team: [
          member(1, "Ada Lovelace", { active: 4 }),
          member(3, "Carla Bianchi", {
            inactiveDays: 9,
            waveTodo: { toCall: 10, noAnswer: 0 },
          }),
          member(4, "Carla Neri", {
            inactiveDays: 12,
            waveTodo: { toCall: 10, noAnswer: 0 },
          }),
          member(5, "Dario Verdi", {
            inactiveDays: 11,
            waveTodo: { toCall: 10, noAnswer: 0 },
          }),
        ],
      }),
      candidates: [
        contactsOf(3, 10, 0),
        contactsOf(4, 10, 0),
        contactsOf(5, 10, 0),
      ],
    })
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    expect(
      await screen.findByText(
        /^Da Carla Bianchi, Carla Neri e Dario a 1 operatore\./
      )
    ).toBeVisible()
  })

  it("su una Wave scaduta aggiunge «La Wave resta scaduta…» e c'è «Proroga» accanto a «Vai alla Wave»", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario({
      deadline: "2026-11-03",
      status: "expired",
      workdaysLeft: null,
      daysSinceDeadline: 1,
    })
    backend.state.moveResult = { moved: 399, skipped: 1 }
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    const title = await screen.findByRole("heading", {
      name: "Spostati 399 contatti",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(within(done).getByText(/La Wave resta scaduta/)).toHaveTextContent(
      `1 non spostato: ${SKIPPED} La Wave resta scaduta: spostare non cambia la scadenza.`
    )
    expect(
      within(done).getByRole("button", { name: "Proroga" })
    ).toBeInTheDocument()
    expect(
      within(done).getByRole("button", { name: "Vai alla Wave" })
    ).toBeInTheDocument()
  })

  it("dopo «Proroga» dalla schermata di fine la frase «La Wave resta scaduta…» e «Proroga» spariscono, e il fuoco resta sul titolo", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario({
      deadline: "2026-11-03",
      status: "expired",
      workdaysLeft: null,
      daysSinceDeadline: 1,
    })
    backend.state.moveResult = { moved: 399, skipped: 1 }
    renderWave(backend)
    await toConfirm(user)
    await user.click(confirmButton())
    const title = await screen.findByRole("heading", {
      name: "Spostati 399 contatti",
    })
    const done = title.closest("section")
    if (done === null) throw new Error("no screen at the end")
    expect(within(done).getByText(/La Wave resta scaduta/)).toBeVisible()

    await user.click(within(done).getByRole("button", { name: "Proroga" }))
    const dialog = await screen.findByRole("dialog", { name: "Proroga" })
    await user.click(
      within(dialog).getByRole("button", { name: /^Proroga al / })
    )

    await waitFor(() =>
      expect(within(done).queryByText(/La Wave resta scaduta/)).toBeNull()
    )
    expect(within(done).queryByRole("button", { name: "Proroga" })).toBeNull()
    expect(
      within(done).getByRole("button", { name: "Vai alla Wave" })
    ).toBeInTheDocument()
    expect(title).toBeInTheDocument()
  })
})

describe("La conferma di «Sposta»: che cosa manda (AC26, D7)", () => {
  it("manda gli id dei primi «Da spostare» di ogni persona, le quote, `which` e `strategy`", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    renderWave(backend)
    await user.click(await screen.findByRole("button", { name: "Riassegna…" }))
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    const card = await screen.findByRole("region", { name: "Quanti contatti" })
    await user.click(
      await within(card).findByRole("radio", { name: "Un numero totale" })
    )
    const field = within(card).getByRole("textbox", {
      name: "Contatti da spostare in tutto",
    })
    await user.clear(field)
    await user.type(field, "3")
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    await user.click(
      screen.getByRole("button", { name: "Sposta 3 a 1 operatore" })
    )

    await screen.findByRole("heading", { name: "Spostati 3 contatti" })
    expect(backend.state.moves).toHaveLength(1)
    const { id, input } = backend.state.moves[0]!
    expect(id).toBe(5)
    const { requestId, ...request } = input
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(request).toEqual({
      which: "both",
      strategy: "pace",
      // Carla 3 × 300/400 = 2.25 → 2, Dario 0.75 → 0, and the unit left to Dario
      contacts: [
        { fromOperatorId: 3, taskIds: [3000, 3001] },
        { fromOperatorId: 4, taskIds: [4000] },
      ],
      receivers: [{ operatorId: 1, count: 3 }],
    })
  })
})

describe("La conferma di «Sposta»: gli esiti di AC16 e AC26", () => {
  it("`NothingToMove` rilegge Wave e candidati, dice «Nessuno dei contatti scelti…» e il pulsante è attivo sull'anteprima riletta; la conferma dopo manda gli id riletti", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.move = "nothingToMove"
    renderWave(backend)
    await toConfirm(user)
    const reads = backend.asked("wave")
    const candidateReads = backend.state.candidateReads.length

    // In the meantime Dario's contacts moved on, and Carla has 100 left
    backend.state.candidates = [
      contactsOf(3, 100, 0, 9000),
      contactsOf(4, 0, 0),
    ]
    await user.click(confirmButton())

    await waitFor(() => expect(summary()).toHaveTextContent(NOTHING_TO_MOVE))
    expect(backend.asked("wave")).toBeGreaterThan(reads)
    expect(backend.state.candidateReads.length).toBeGreaterThan(candidateReads)
    expect(toasts()).toEqual([])
    const button = screen.getByRole("button", {
      name: "Sposta 100 a 1 operatore",
    })
    expect(button).toBeEnabled()

    delete backend.state.outcome.move
    await user.click(button)

    await screen.findByRole("heading", { name: "Spostati 100 contatti" })
    expect(backend.state.moves).toHaveLength(2)
    const [first, second] = backend.state.moves
    expect(first!.input.contacts[0]!.taskIds).toHaveLength(200 + 100 - 0)
    expect(second!.input.contacts).toEqual([
      {
        fromOperatorId: 3,
        taskIds: Array.from({ length: 100 }, (_, i) => 9000 + i),
      },
    ])
    // A different request: a new `requestId` (D4)
    expect(second!.input.requestId).not.toBe(first!.input.requestId)
  })

  it("`NumbersChanged` rilegge Wave e candidati, dice «I numeri sono cambiati…» e il pulsante è attivo sull'anteprima riletta", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.move = "numbersChanged"
    renderWave(backend)
    await toConfirm(user)
    const candidateReads = backend.state.candidateReads.length

    backend.state.candidates = [contactsOf(3, 150, 0), contactsOf(4, 50, 0)]
    await user.click(confirmButton())

    await waitFor(() => expect(summary()).toHaveTextContent(NUMBERS_CHANGED))
    expect(backend.state.candidateReads.length).toBeGreaterThan(candidateReads)
    expect(
      screen.getByRole("button", { name: "Sposta 200 a 1 operatore" })
    ).toBeEnabled()
    expect(toasts()).toEqual([])
  })

  it("un altro errore dichiarato dice «Non è stato possibile completare l'operazione. Riprova.» con il pulsante attivo", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.move = "requestIdConflict"
    renderWave(backend)
    await toConfirm(user)

    await user.click(confirmButton())

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Non è stato possibile completare l'operazione. Riprova."
      )
    )
    expect(confirmButton()).toBeEnabled()
    expect(toasts()).toEqual([])
  })

  it("un esito incerto rilegge e dice «Non sappiamo se…»; la stessa richiesta riusa il `requestId`", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.move = "uncertain"
    renderWave(backend)
    await toConfirm(user)
    const reads = backend.asked("wave")
    const candidateReads = backend.state.candidateReads.length

    await user.click(confirmButton())

    await waitFor(() => expect(summary()).toHaveTextContent(UNCERTAIN))
    expect(backend.asked("wave")).toBeGreaterThan(reads)
    expect(backend.state.candidateReads.length).toBeGreaterThan(candidateReads)
    expect(confirmButton()).toBeEnabled()

    await user.click(confirmButton())
    await waitFor(() => expect(backend.state.moves).toHaveLength(2))
    const [first, second] = backend.state.moves.map(
      (call) => call.input.requestId
    )
    expect(second).toBe(first)
  })

  it("la sessione scaduta dice «La sessione è scaduta…» e la conferma resta disattivata", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    const { state, auth } = session()
    renderWave(backend, { auth })
    await toConfirm(user)

    state.now = "expired"
    await user.click(confirmButton())

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "La sessione è scaduta: accedi di nuovo. Nessun contatto è cambiato."
      )
    )
    expect(confirmButton()).toBeDisabled()
    expect(backend.state.moves).toEqual([])
  })

  it("un utente `OPERATORE` ha «Solo un admin può spostare contatti.» e la conferma disattivata", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    const { state, auth } = session()
    renderWave(backend, { auth })
    await toConfirm(user)

    state.now = "operator"
    await user.click(confirmButton())

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Solo un admin può spostare contatti."
      )
    )
    expect(confirmButton()).toBeDisabled()
    expect(backend.state.moves).toEqual([])
  })

  it("la rilettura fallita dice «Non è stato possibile rileggere i numeri.» con «Riprova», e la conferma torna attiva quando riesce", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.move = "numbersChanged"
    renderWave(backend)
    await toConfirm(user)

    backend.state.outcome.moveCandidates = "uncertain"
    await user.click(confirmButton())

    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        "Non è stato possibile rileggere i numeri."
      )
    )
    expect(confirmButton()).toBeDisabled()

    delete backend.state.outcome.moveCandidates
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await waitFor(() => expect(summary()).toHaveTextContent(NUMBERS_CHANGED))
    expect(confirmButton()).toBeEnabled()
  })
})

describe("Mentre lo spostamento è in corso", () => {
  it("il pulsante dice «Spostamento in corso…» ed è disattivato, «Annulla» è fermo e non parte una seconda conferma", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    const { state, auth } = session()
    renderWave(backend, { auth })
    await toConfirm(user)

    state.hold()
    await user.click(confirmButton())

    const pending = await screen.findByRole("button", {
      name: "Spostamento in corso…",
    })
    expect(pending).toBeDisabled()
    expect(screen.getByRole("button", { name: /Annulla/ })).toBeDisabled()
    await user.click(pending)

    state.release()
    await screen.findByRole("heading", { name: "Spostati 400 contatti" })
    expect(backend.state.moves).toHaveLength(1)
  })
})

describe("Due conferme nello stesso istante", () => {
  it("due clic nello stesso turno mandano una sola richiesta", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    const { state, auth } = session()
    renderWave(backend, { auth })
    await toConfirm(user)

    state.hold()
    const button = confirmButton()
    fireEvent.click(button)
    fireEvent.click(button)

    state.release()
    await screen.findByRole("heading", { name: "Spostati 400 contatti" })
    expect(backend.state.moves).toHaveLength(1)
  })
})

describe("Lasciare la pagina durante lo spostamento (AC16, D18)", () => {
  const leave = async (backend: Backend) => {
    const user = userEvent.setup()
    const { state, auth } = session()
    const { router } = renderWave(backend, { auth })
    await toConfirm(user)
    state.hold()
    await user.click(confirmButton())
    await screen.findByRole("button", { name: "Spostamento in corso…" })
    await router.navigate("/dashboard/import")
    await screen.findByText("Storico degli import")
    state.release()
  }

  it("riuscita: il toast «Spostati <N> contatti della <nome>»", async () => {
    await leave(carlaAndDario())
    expect(
      await screen.findByText("Spostati 400 contatti della wave_ottobre")
    ).toBeInTheDocument()
  })

  it("esito incerto: il toast «Non sappiamo se l'operazione sulla <nome> è andata a buon fine…»", async () => {
    const backend = carlaAndDario()
    backend.state.outcome.move = "uncertain"
    await leave(backend)
    expect(
      await screen.findByText(
        "Non sappiamo se l'operazione sulla wave_ottobre è andata a buon fine: controlla i numeri nella sua pagina."
      )
    ).toBeInTheDocument()
  })

  it("altro: il toast «La <nome> non è cambiata.»", async () => {
    const backend = carlaAndDario()
    backend.state.outcome.move = "requestIdConflict"
    await leave(backend)
    expect(
      await screen.findByText("La wave_ottobre non è cambiata.")
    ).toBeInTheDocument()
  })
})
