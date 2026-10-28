import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ContactForbidden } from "@mito/contract/errors"
import { contactDetail, superseded } from "@/test/contacts"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { DA, holdWrites, lastAlert, openDetail, toastLink } from "./detail"

// The priority of the contact in the detail, as the tests of
// `ContactPriorityControl` of the Next.js app, on the page with a backend in
// memory

type Saved = { priority: number | null; customPriority: boolean | null }

/** The detail of the contact of `contactRow` with the priority `saved` */
const setup = (saved: Saved) => openDetail([contactDetail({ contact: saved })])

const trigger = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /, cambia priorità$/ })

beforeEach(() => {
  sessionStorage.clear()
})

describe("la priorità nel dettaglio: cosa mostra (AC42, AC43)", () => {
  it.each([
    [{ priority: 70, customPriority: true }, "Manuale"],
    [{ priority: 120, customPriority: false }, "Automatica"],
    [{ priority: null, customPriority: null }, "Automatica"],
  ])(
    "con %o dice '%s' e lo mette nel nome del pulsante",
    async (saved, label) => {
      await setup(saved)

      expect(trigger().textContent).toContain(label)
      expect(trigger().getAttribute("aria-label")).toBe(
        `${label}, cambia priorità`
      )
    }
  )

  it("offre le quattro fasce e 'Automatica', con la scelta attuale segnata", async () => {
    const { user } = await setup({ priority: 70, customPriority: true })

    await user.click(trigger())

    const options = screen.getAllByRole("menuitemradio")
    expect(options.map((option) => option.textContent)).toEqual([
      "Bassa",
      "Media",
      "Alta",
      "Urgente",
      "Automatica",
    ])
    expect(
      options.map((option) => option.getAttribute("aria-checked"))
    ).toEqual(["false", "false", "true", "false", "false"])
  })

  it("con la priorità automatica è segnata 'Automatica'", async () => {
    const { user } = await setup({ priority: 120, customPriority: false })

    await user.click(trigger())

    expect(
      screen
        .getByRole("menuitemradio", { name: "Automatica" })
        .getAttribute("aria-checked")
    ).toBe("true")
  })
})

describe("scegliere la priorità (AC42, AC43)", () => {
  it("una fascia salva quella fascia e il pulsante mostra il valore salvato finché non arriva il nuovo", async () => {
    const { user, backend } = await setup({
      priority: 120,
      customPriority: false,
    })
    const open = holdWrites(backend)
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    // Not before the save: the saved value is still on screen, and waiting
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("true")
    )
    expect(trigger().getAttribute("aria-label")).toBe(
      "Automatica, cambia priorità"
    )
    open()
    await waitFor(() =>
      expect(backend.state.priorities).toEqual([
        { taskId: 101, priority: "high" },
      ])
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Manuale, cambia priorità"
      )
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
  })

  it("'Automatica' rimanda la priorità al cron: 'auto', e l'etichetta cambia dopo il salvataggio e non prima", async () => {
    const { user, backend } = await setup({
      priority: 100,
      customPriority: true,
    })
    const open = holdWrites(backend)
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "Automatica" }))

    expect(trigger().getAttribute("aria-label")).toBe(
      "Manuale, cambia priorità"
    )
    open()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Automatica, cambia priorità"
      )
    )
    expect(backend.state.priorities).toEqual([
      { taskId: 101, priority: "auto" },
    ])
  })

  it("riscegliere la scelta attuale non chiama il server", async () => {
    const { user, backend } = await setup({
      priority: 100,
      customPriority: true,
    })
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    expect(backend.state.priorities).toHaveLength(0)
  })

  it("non si invia due volte durante il salvataggio", async () => {
    const { user, backend } = await setup({
      priority: 120,
      customPriority: false,
    })
    const open = holdWrites(backend)
    await user.click(trigger())
    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    await user.click(trigger())

    expect(screen.queryByRole("menuitemradio")).toBeNull()
    open()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(backend.state.priorities).toHaveLength(1)
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("toast con il motivo, lo stesso testo dentro la finestra, e il valore salvato resta", async () => {
    const { user, backend } = await setup({
      priority: 120,
      customPriority: false,
    })
    backend.state.priorityAnswer = () => ({
      rejected: new ContactForbidden({ assignee: "Giulia Bianchi" }),
    })
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))

    const reason =
      "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi"
    await waitFor(() => expect(lastAlert()).toBe(reason))
    expect(screen.getAllByText(reason)).toHaveLength(2)
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger().getAttribute("aria-label")).toBe(
      "Automatica, cambia priorità"
    )
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const { user, backend } = await setup({
      priority: 120,
      customPriority: false,
    })
    backend.state.priorityAnswer = () => ({ rejected: superseded(303) })
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))

    await waitFor(() =>
      expect(lastAlert()).toBe(
        "Questo contatto è stato sostituito da uno più recente"
      )
    )
    expect(toastLink("Vai al contatto attivo").getAttribute("href")).toBe(
      detailHrefFromDa(303, DA)
    )
  })
})
