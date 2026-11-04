import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type MoveCandidates } from "@mito/contract/import"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type WaveView } from "@/api/import"
import { ada } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"
import { renderWave } from "../../_test/page"

type Member = WaveView["team"][number]
type User = ReturnType<typeof userEvent.setup>

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

/** Carla (300) and Dario (100), both inactive, and Ada active */
const carlaAndDario = () =>
  fakeImport({
    wave: waveView({
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
    }),
    candidates: [contactsOf(3, 200, 100), contactsOf(4, 100, 0)],
  })

/** «Riassegna…» of the overview, then «Avanti» on «Da chi» */
async function toWhich(user: User) {
  await user.click(await screen.findByRole("button", { name: "Riassegna…" }))
  await user.click(screen.getByRole("button", { name: "Avanti" }))
  return screen.findByRole("region", { name: "Quanti contatti" })
}

describe("«Quanti contatti» (AC24)", () => {
  it("con Carla (300) e Dario (100) scelti e «Un numero totale» a 200, la tabella mostra 150 e 50 e «Totale 200»", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    const card = await toWhich(user)
    await user.click(
      await within(card).findByRole("radio", { name: "Un numero totale" })
    )
    const field = within(card).getByRole("textbox", {
      name: "Contatti da spostare in tutto",
    })
    await user.clear(field)
    await user.type(field, "200")

    const table = within(card).getByRole("table")
    const rows = within(table).getAllByRole("row")
    expect(rows[1]).toHaveTextContent(/Carla Bianchi.*300.*150/)
    expect(rows[2]).toHaveTextContent(/Dario Verdi.*100.*50/)
    expect(rows[3]).toHaveTextContent(/Totale.*200/)
  })
})

/** «Da chi» opened from the overview, with Carla and Dario chosen */
async function openFromOverview(user: User) {
  await user.click(await screen.findByRole("button", { name: "Riassegna…" }))
  return screen.findByRole("table", { name: "Da chi" })
}

const checked = () =>
  screen
    .getAllByRole("checkbox")
    .filter((box) => box.getAttribute("aria-checked") === "true")
    .map(
      (box) =>
        document.getElementById(box.getAttribute("aria-labelledby")!)
          ?.textContent
    )

describe("Le entrate della riassegnazione (AC22)", () => {
  it("«Riassegna…» della panoramica apre «Da chi» con gli inattivi che hanno da fare scelti", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await openFromOverview(user)
    expect(
      screen.getByRole("heading", { name: "Riassegna" })
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Da chi" })).toBeInTheDocument()
    expect(checked()).toEqual(["Carla Bianchi", "Dario Verdi"])
    expect(screen.getByText("2 scelti")).toBeInTheDocument()
  })

  it("«Sposta» di una riga apre con quella persona scelta", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await user.click(
      await screen.findByRole("button", {
        name: "Sposta il da fare di Dario Verdi",
      })
    )
    await screen.findByRole("table", { name: "Da chi" })
    expect(checked()).toEqual(["Dario Verdi"])
    expect(screen.getByText("1 scelto")).toBeInTheDocument()
  })

  it("«Riassegna» dell'avviso della Wave scaduta apre con gli inattivi scelti", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.wave = {
      ...backend.state.wave,
      deadline: "2026-11-03",
      status: "expired",
      workdaysLeft: null,
      daysSinceDeadline: 1,
    }
    renderWave(backend)

    const alert = await screen.findByRole("alert")
    await user.click(within(alert).getByRole("button", { name: "Riassegna" }))
    await screen.findByRole("table", { name: "Da chi" })
    expect(checked()).toEqual(["Carla Bianchi", "Dario Verdi"])
  })

  it("«Annulla» torna alla panoramica", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await openFromOverview(user)
    await user.click(screen.getByRole("button", { name: "Annulla" }))
    expect(
      await screen.findByRole("region", { name: "Panoramica della Wave" })
    ).toBeInTheDocument()
  })
})

describe("«Da chi» (AC23, AC32)", () => {
  it("ha i gruppi, le colonne lette con il loro nome e l'ordine per «Totale»", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.wave = {
      ...backend.state.wave,
      team: [
        ...backend.state.wave.team,
        member(5, "Elena Rossi", { waveTodo: { toCall: 3, noAnswer: 4 } }),
        member(6, "Bruno Neri", { waveTodo: { toCall: 9, noAnswer: 0 } }),
        member(8, "Zeno Admin", {
          role: "ADMIN",
          waveTodo: { toCall: 1, noAnswer: 0 },
        }),
      ],
    }
    renderWave(backend)

    const table = await openFromOverview(user)
    expect(
      Array.from(table.querySelectorAll("thead th")).map(
        (cell) => cell.textContent
      )
    ).toEqual(["Nome", "Da chiamare", "Non risponde", "Totale"])
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent)
    expect(rows).toEqual([
      "Inattivi · conviene spostare i loro contatti",
      "Carla Bianchiinattivo da 9 giorni, Da chiamare 200, Non risponde 100, Totale 300",
      "Dario Verdiinattivo da 12 giorni, Da chiamare 100, Non risponde 0, Totale 100",
      "Operatori",
      "Bruno Neri10 chiamate al giorno, Da chiamare 9, Non risponde 0, Totale 9",
      "Elena Rossi10 chiamate al giorno, Da chiamare 3, Non risponde 4, Totale 7",
      "Admin",
      "Zeno Admin10 chiamate al giorno, Da chiamare 1, Non risponde 0, Totale 1",
    ])
  })

  it("un clic sulla riga ne cambia la scelta; «Nessuno» lascia «Avanti» disattivato, «Scegli gli inattivi» li sceglie", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await openFromOverview(user)
    await user.click(screen.getByText("Dario Verdi"))
    expect(checked()).toEqual(["Carla Bianchi"])

    await user.click(screen.getByRole("button", { name: "Nessuno" }))
    expect(screen.getByText("0 scelti")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "Scegli gli inattivi" })
    )
    expect(checked()).toEqual(["Carla Bianchi", "Dario Verdi"])
    expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
  })

  it("«Avanti» chiede i candidati di chi è scelto", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    renderWave(backend)

    await toWhich(user)
    expect(backend.state.candidateReads).toEqual([{ id: 5, from: [3, 4] }])
  })
})

/** A session the test can hold: while held, every call waits for `release` */
function heldSession() {
  let held: Promise<void> | null = null
  const gate = {
    release: () => undefined as void,
    hold: () => {
      held = new Promise<void>((resolve) => {
        gate.release = () => {
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
      return yield* Effect.provideService(endpoint, CurrentUser, {
        operator: ada,
        actor: { operatorId: ada.id, role: "ADMIN" },
      })
    })
  )
  return { gate, auth }
}

describe("I candidati del passo 2 (D7)", () => {
  it("mentre arrivano le due schede mostrano lo scheletro e «Avanti» è disattivato", async () => {
    const user = userEvent.setup()
    const { gate, auth } = heldSession()
    renderWave(carlaAndDario(), { auth })

    await openFromOverview(user)
    gate.hold()
    await user.click(screen.getByRole("button", { name: "Avanti" }))

    expect(
      screen.getByRole("heading", { name: "Quali e quanti contatti" })
    ).toBeInTheDocument()
    for (const name of ["Quali contatti", "Quanti contatti"]) {
      const card = screen.getByRole("region", { name })
      expect(card).toHaveAttribute("aria-busy", "true")
      expect(
        card.querySelectorAll('[data-slot="skeleton"]').length
      ).toBeGreaterThan(0)
      expect(within(card).queryByRole("radio")).not.toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled()

    act(() => gate.release())
    expect(
      await within(
        screen.getByRole("region", { name: "Quali contatti" })
      ).findAllByRole("radio")
    ).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
  })

  it("se falliscono, al posto delle schede «Non è stato possibile rileggere i numeri.», e «Riprova» li richiede", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.outcome.moveCandidates = "uncertain"
    renderWave(backend)

    await openFromOverview(user)
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Non è stato possibile rileggere i numeri.")
    expect(
      screen.queryByRole("region", { name: "Quali contatti" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled()

    backend.state.outcome.moveCandidates = undefined
    await user.click(within(alert).getByRole("button", { name: "Riprova" }))
    expect(
      await screen.findByRole("region", { name: "Quali contatti" })
    ).toBeInTheDocument()
    expect(backend.state.candidateReads).toHaveLength(2)
  })

  it("i numeri del passo 2 sono quelli dei candidati anche quando `wave` ne dice altri", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.candidates = [contactsOf(3, 20, 10), contactsOf(4, 5, 0)]
    renderWave(backend)

    const card = await toWhich(user)
    const which = screen.getByRole("region", { name: "Quali contatti" })
    expect(
      await within(which).findByRole("radio", {
        name: "Da chiamare e Non risponde · 35",
      })
    ).toBeChecked()
    expect(
      within(which).getByRole("radio", { name: "Solo Da chiamare · 25" })
    ).toBeInTheDocument()
    expect(
      within(which).getByRole("radio", { name: "Solo Non risponde · 10" })
    ).toBeInTheDocument()
    expect(
      within(card).getByRole("radio", { name: "Tutti · 35" })
    ).toBeChecked()
    const rows = within(within(card).getByRole("table")).getAllByRole("row")
    expect(rows[1]).toHaveTextContent(
      "Carla Bianchi, Contatti 30, Da spostare 30"
    )
    expect(rows[2]).toHaveTextContent("Dario Verdi, Contatti 5, Da spostare 5")
    expect(rows[3]).toHaveTextContent("Totale, Da spostare 35")
  })
})

describe("«Quali contatti» (AC24)", () => {
  it("«Solo Non risponde · 0» è disattivata, e senza Da chiamare è scelta la prima opzione non a 0", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.candidates = [contactsOf(4, 100, 0)]
    renderWave(backend)

    await user.click(
      await screen.findByRole("button", {
        name: "Sposta il da fare di Dario Verdi",
      })
    )
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    const which = await screen.findByRole("region", { name: "Quali contatti" })
    expect(
      await within(which).findByRole("radio", { name: "Solo Non risponde · 0" })
    ).toBeDisabled()
    expect(
      within(which).getByRole("radio", {
        name: "Da chiamare e Non risponde · 100",
      })
    ).toBeChecked()

    backend.state.candidates = [contactsOf(4, 0, 6)]
    await user.click(screen.getByRole("button", { name: "Indietro" }))
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    expect(
      await within(
        await screen.findByRole("region", { name: "Quali contatti" })
      ).findByRole("radio", { name: "Da chiamare e Non risponde · 6" })
    ).toBeChecked()
  })

  it("ogni opzione ha per descrizione la sua nota", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await toWhich(user)
    const which = screen.getByRole("region", { name: "Quali contatti" })
    expect(
      await within(which).findByRole("radio", {
        name: "Solo Da chiamare · 300",
      })
    ).toHaveAccessibleDescription(
      "Contatti in Da chiamare, che aspettano una chiamata"
    )
  })
})

describe("«Quali contatti» (AC24, AC34): la riga è un'area di clic", () => {
  it("un clic sulla nota di «Solo Da chiamare» la sceglie", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await toWhich(user)
    const which = screen.getByRole("region", { name: "Quali contatti" })
    const toCall = await within(which).findByRole("radio", {
      name: "Solo Da chiamare · 300",
    })
    expect(toCall).not.toBeChecked()

    await user.click(
      within(which).getByText(
        "Contatti in Da chiamare, che aspettano una chiamata"
      )
    )
    expect(toCall).toBeChecked()
  })
})

describe("«Quanti contatti» (AC24): le opzioni e il campo", () => {
  it("«Lo stesso numero per operatore» con 120 e uno che ne ha 80 → 120 e 80", async () => {
    const user = userEvent.setup()
    const backend = carlaAndDario()
    backend.state.candidates = [contactsOf(3, 200, 100), contactsOf(4, 80, 0)]
    renderWave(backend)

    const card = await toWhich(user)
    await user.click(
      await within(card).findByRole("radio", {
        name: "Lo stesso numero per operatore",
      })
    )
    const field = within(card).getByRole("textbox", {
      name: "Contatti da prendere a ogni operatore",
    })
    // It starts from its maximum: the most among the people chosen
    expect(field).toHaveValue("300")
    await user.clear(field)
    await user.type(field, "120")

    const rows = within(within(card).getByRole("table")).getAllByRole("row")
    expect(rows[1]).toHaveTextContent("Da spostare 120")
    expect(rows[2]).toHaveTextContent("Da spostare 80")
    expect(rows[3]).toHaveTextContent("Totale, Da spostare 200")
  })

  it("il campo prende il fuoco con un clic o con Spazio, non con le frecce del gruppo", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    const card = await toWhich(user)
    const all = await within(card).findByRole("radio", { name: "Tutti · 400" })
    all.focus()
    // Radix moves the focus after the keydown and checks while the arrow is down
    await user.keyboard("{ArrowDown>}")
    const total = within(card).getByRole("radio", { name: "Un numero totale" })
    await waitFor(() => expect(total).toBeChecked())
    await user.keyboard("{/ArrowDown}")
    expect(total).toHaveFocus()
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da spostare in tutto",
      })
    ).not.toHaveFocus()

    await user.keyboard("{ArrowDown>}")
    const each = within(card).getByRole("radio", {
      name: "Lo stesso numero per operatore",
    })
    await waitFor(() => expect(each).toBeChecked())
    await user.keyboard("{/ArrowDown}")
    expect(each).toHaveFocus()
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da prendere a ogni operatore",
      })
    ).not.toHaveFocus()
    await user.keyboard(" ")
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da prendere a ogni operatore",
      })
    ).toHaveFocus()

    await user.click(within(card).getByText("Un numero totale"))
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da spostare in tutto",
      })
    ).toHaveFocus()
  })

  it("cambiare opzione riporta il numero al massimo; fuori intervallo l'errore è sotto il campo e ne è la descrizione", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    const card = await toWhich(user)
    await user.click(
      await within(card).findByRole("radio", { name: "Un numero totale" })
    )
    const field = within(card).getByRole("textbox", {
      name: "Contatti da spostare in tutto",
    })
    expect(field).toHaveValue("400")
    await user.clear(field)
    await user.type(field, "401")
    expect(field).toHaveAccessibleDescription("Scrivi un numero da 1 a 400")
    expect(
      within(card).getByText("Scrivi un numero da 1 a 400")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled()

    await user.click(within(card).getByText("Lo stesso numero per operatore"))
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da prendere a ogni operatore",
      })
    ).toHaveValue("300")
    await user.click(within(card).getByText("Un numero totale"))
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da spostare in tutto",
      })
    ).toHaveValue("400")

    await user.click(
      within(screen.getByRole("region", { name: "Quali contatti" })).getByText(
        "Solo Non risponde · 100"
      )
    )
    expect(
      within(card).getByRole("textbox", {
        name: "Contatti da spostare in tutto",
      })
    ).toHaveValue("100")
    expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
  })

  it("con una sola persona dice «Solo una parte», senza «Lo stesso numero per operatore», con le note al singolare", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    await user.click(
      await screen.findByRole("button", {
        name: "Sposta il da fare di Carla Bianchi",
      })
    )
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    const card = await screen.findByRole("region", { name: "Quanti contatti" })
    expect(
      await within(card).findByRole("radio", { name: "Solo una parte" })
    ).toHaveAccessibleDescription("Scrivi quanti contatti spostare")
    expect(
      within(card).getByRole("radio", { name: "Tutti · 300" })
    ).toHaveAccessibleDescription(
      "Sposti tutti i contatti scelti dell'operatore selezionato"
    )
    expect(
      within(card).queryByRole("radio", {
        name: "Lo stesso numero per operatore",
      })
    ).not.toBeInTheDocument()
  })
})

describe("«A chi» (AC25)", () => {
  it("dice «200 da spostare da Carla e Dario», non ha chi cede e il pulsante dice «Sposta 200 a 1 operatore»", async () => {
    const user = userEvent.setup()
    renderWave(carlaAndDario())

    const card = await toWhich(user)
    await user.click(
      await within(card).findByRole("radio", { name: "Un numero totale" })
    )
    const field = within(card).getByRole("textbox", {
      name: "Contatti da spostare in tutto",
    })
    await user.clear(field)
    await user.type(field, "200")
    await user.click(screen.getByRole("button", { name: "Avanti" }))

    expect(screen.getByRole("heading", { name: "A chi" })).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "200 da spostare da Carla e Dario"
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", { name: "Carla Bianchi" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", { name: "Dario Verdi" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Ada Lovelace" })).toBeChecked()
    expect(
      screen.getByRole("button", { name: "Sposta 200 a 1 operatore" })
    ).toBeEnabled()
  })
})
