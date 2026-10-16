import { act, render, screen, within } from "@testing-library/react"
import { StrictMode } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Message } from "@/lib/types/schemas"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerChat, CustomerNewChat } from "../CustomerChat"
import { updateChatAction } from "../_actions/updateChat"
import { deleteMessageAction } from "../_actions/deleteMessage"
import { clearUnsentNotes } from "../unsentNote"

type Note = Pick<Message, "id" | "content" | "sendDate" | "operatorId">

const mocks = vi.hoisted(() => ({
  updateCustomer: vi.fn(),
  updatePratica: vi.fn(),
  // Settled by hand: the action is the boundary towards the server
  updateChat: [] as Array<(value: unknown) => void>,
  deleteMessage: [] as Array<(value: unknown) => void>,
  // "Avvia una chat": the tRPC mutation, settled by hand
  createChat: [] as Array<{
    resolve: (value: { id: number }) => void
    reject: (error: Error) => void
  }>,
  createChatMutate: vi.fn(
    () =>
      new Promise<{ id: number }>((resolve, reject) => {
        mocks.createChat.push({ resolve, reject })
      })
  ),
  // The operator of the session, until `getUserOperator` loads it
  operator: { id: 11 } as { id: number } | undefined,
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getUserOperator: { useQuery: () => ({ data: mocks.operator }) },
      getOperatorById: {
        useQuery: () => ({
          data: { name: "Federica", surname: "Rossi" },
          isLoading: false,
        }),
      },
    },
    customer: {
      updateLastEdit: { useMutation: () => ({ mutate: mocks.updateCustomer }) },
    },
    chat: {
      createNewCustomerChat: {
        useMutation: () => ({ mutateAsync: mocks.createChatMutate }),
      },
    },
    pratiche: {
      updateLastEdit: { useMutation: () => ({ mutate: mocks.updatePratica }) },
    },
  },
}))

const router = { replace: vi.fn(), refresh: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  // The id of the page the chat sits in: a contact, not the customer
  useParams: () => ({ id: "7" }),
}))

vi.mock("../_actions/updateChat", () => ({
  updateChatAction: vi.fn(
    () =>
      new Promise((resolve) => {
        mocks.updateChat.push(resolve)
      })
  ),
}))
vi.mock("../_actions/deleteMessage", () => ({
  deleteMessageAction: vi.fn(
    () =>
      new Promise((resolve) => {
        mocks.deleteMessage.push(resolve)
      })
  ),
}))

const note = (id: number, content: string): Note => ({
  id,
  content,
  sendDate: new Date("2026-10-15T09:00:00Z"),
  operatorId: 11,
})

function renderChat(messages: Note[], total = messages.length, limit = 5) {
  const view = (current: Note[], currentTotal: number) => (
    <CollassableSection defaultValue={["item-1"]}>
      <CustomerChat
        customerId="c-42"
        chatId={3}
        messages={current}
        total={currentTotal}
        limit={limit}
      />
    </CollassableSection>
  )
  const result = render(view(messages, total))
  return {
    ...result,
    // The page drawn again by the server after the action
    reload: (next: Note[], nextTotal = next.length) =>
      result.rerender(view(next, nextTotal)),
  }
}

const field = () => screen.getByRole<HTMLTextAreaElement>("textbox")
const submit = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Commenta" })
// The notes in the chat, not the text in the field
const notesWith = (text: string) =>
  screen.queryAllByText(text, { ignore: "script, style, textarea" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateChat.length = 0
  mocks.deleteMessage.length = 0
  mocks.createChat.length = 0
  mocks.operator = { id: 11 }
  // Unsent notes outlive the chat (T4.4): not from one test to the next
  window.sessionStorage.clear()
  clearUnsentNotes()
  // The chat in the contact detail: the URL is not the customer's
  window.history.pushState({}, "", "/dashboard/contatti/7")
})

describe("CustomerChat, invio di una nota", () => {
  it("con l'URL di un contatto aggiorna il cliente della chat e non la pratica", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(updateChatAction).toHaveBeenCalledWith({
      chatId: 3,
      content: "Richiamare domani",
      customerId: "c-42",
    })
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })

    expect(mocks.updateCustomer).toHaveBeenCalledWith({ id: "c-42" })
    expect(mocks.updatePratica).not.toHaveBeenCalled()
  })

  it("la nota compare subito, il campo si svuota e 'Commenta' resta disabilitato fino alla risposta", async () => {
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(notesWith("Richiamare domani")).toHaveLength(1)
    expect(field().value).toBe("")
    expect(submit().getAttribute("aria-disabled")).toBe("true")
    // Still focusable: not the `disabled` attribute
    expect(submit().disabled).toBe(false)

    // A second send while waiting does not reach the server
    await user.type(field(), "Doppio")
    await user.click(submit())
    expect(updateChatAction).toHaveBeenCalledTimes(1)

    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })
    expect(submit().getAttribute("aria-disabled")).not.toBe("true")
    // Not reloaded yet: the pending note stays, no flash
    expect(notesWith("Richiamare domani")).toHaveLength(1)

    reload([note(1, "Prima nota"), note(901, "Richiamare domani")])
    expect(notesWith("Richiamare domani")).toHaveLength(1)
  })

  it("con 5 note e una dello stesso testo, la nota in attesa sparisce solo quando arriva il suo id", async () => {
    const before = [
      note(1, "Uno"),
      note(2, "Due"),
      note(3, "Tre"),
      note(4, "Quattro"),
      note(5, "Richiamare"),
    ]
    const { reload } = renderChat(before, 12, 5)
    const user = userEvent.setup()

    await user.type(field(), "Richiamare")
    await user.click(submit())
    expect(notesWith("Richiamare")).toHaveLength(2)

    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 902 })
    })

    // Same text already in the chat, same number of notes: not saved yet here
    reload(before, 12)
    expect(notesWith("Richiamare")).toHaveLength(2)

    // The window of the last 5 moves and holds the saved note
    reload([...before.slice(1), note(902, "Richiamare")], 13)
    expect(notesWith("Richiamare")).toHaveLength(2)
  })

  it("la nota in attesa non ha la chiave di una nota salvata", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
    const user = userEvent.setup()

    await user.type(field(), "In attesa")
    await user.click(submit())

    expect(notesWith("In attesa")).toHaveLength(1)
    expect(notesWith("Prima nota")).toHaveLength(1)
    expect(
      errors.mock.calls.some((call) => String(call[0]).includes("same key"))
    ).toBe(false)
    errors.mockRestore()
  })

  it("la nota in attesa non ha il pulsante per eliminarla, anche al passaggio del mouse", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "In attesa")
    await user.click(submit())

    const pending = screen.getByText("In attesa").closest("article")!
    await user.hover(pending)
    expect(within(pending).queryByRole("button")).toBeNull()

    // A saved note has it
    const saved = screen.getByText("Prima nota").closest("article")!
    await user.hover(saved)
    expect(within(saved).queryByRole("button")).not.toBeNull()
  })
})

describe("CustomerChat, eliminazione di una nota", () => {
  it("con l'URL di un contatto aggiorna il cliente della chat e non la pratica", async () => {
    renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
    const user = userEvent.setup()

    const saved = screen.getByText("Seconda nota").closest("article")!
    await user.hover(saved)
    await user.click(within(saved).getByRole("button"))

    expect(deleteMessageAction).toHaveBeenCalledWith({
      id: 2,
      operatorId: 11,
      customerId: "c-42",
    })
    await act(async () => {
      mocks.deleteMessage[0]!(undefined)
    })

    expect(mocks.updateCustomer).toHaveBeenCalledWith({ id: "c-42" })
    expect(mocks.updatePratica).not.toHaveBeenCalled()
  })
})

describe("CustomerNewChat, avvio della chat", () => {
  const start = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "Avvia una chat" })

  it("crea la chat una volta sola, anche con un doppio clic", async () => {
    render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.dblClick(start())

    expect(mocks.createChatMutate).toHaveBeenCalledTimes(1)
    expect(mocks.createChatMutate).toHaveBeenCalledWith({ customerId: "c-42" })
  })

  it("durante la creazione la scheda resta e il pulsante è occupato, con lo spinner", async () => {
    render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.click(start())

    expect(screen.getByText("Inizia una nuova chat")).toBeTruthy()
    expect(start().getAttribute("aria-busy")).toBe("true")
    expect(start().getAttribute("aria-disabled")).toBe("true")
    expect(start().querySelector("svg.animate-spin")).not.toBeNull()
    expect(start().querySelector("svg")?.getAttribute("class")).toContain(
      "motion-reduce:animate-none"
    )
  })

  it("quando il server risponde aggiorna la pagina, che mostra la chat", async () => {
    render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.click(start())
    expect(router.refresh).not.toHaveBeenCalled()
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })

    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("se la creazione fallisce compare 'Chat non avviata, riprova' e il pulsante torna attivo", async () => {
    render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.reject(new Error("Failed to fetch"))
    })

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe("Chat non avviata, riprova")
    expect(start().getAttribute("aria-describedby")).toBe(alert.id)
    expect(start().getAttribute("aria-busy")).not.toBe("true")
    expect(start().getAttribute("aria-disabled")).not.toBe("true")
    expect(router.refresh).not.toHaveBeenCalled()

    // Trying again clears the message
    await user.click(start())
    expect(screen.queryByRole("alert")).toBeNull()
    expect(mocks.createChatMutate).toHaveBeenCalledTimes(2)
  })

  it("la chat appena avviata mette il focus nel campo della nota", async () => {
    const { unmount } = render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })
    // The refreshed page draws the chat in place of the button
    unmount()
    renderChat([])

    expect(document.activeElement).toBe(field())
  })

  it("una chat che c'era già non prende il focus", () => {
    renderChat([note(1, "Prima nota")])

    expect(document.activeElement).not.toBe(field())
  })

  it("se la creazione fallisce, la chat aperta dopo non prende il focus", async () => {
    const { unmount } = render(<CustomerNewChat customerId="c-42" />)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.reject(new Error("Failed to fetch"))
    })
    unmount()
    renderChat([])

    expect(document.activeElement).not.toBe(field())
  })
})

const alertText = "Nota non inviata, riprova"
const failure = () => screen.queryByRole("alert")

/** Sends `text` and lets the action answer with `answer` (a rejection when it's an Error). */
async function sendAndFail(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  answer: unknown
) {
  vi.mocked(updateChatAction).mockImplementationOnce(() =>
    answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer as never)
  )
  await user.type(field(), text)
  await user.click(submit())
}

describe("CustomerChat, nota non inviata (AC76)", () => {
  it.each([
    ["rifiuta", new Error("Failed to fetch")],
    ["restituisce un errore", { error: "Invalid form data" }],
    ["risolve senza risultato", undefined],
  ])(
    "se l'action %s, il testo torna nel campo con il messaggio e la nota non resta nella chat",
    async (_case, answer) => {
      renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()

      await sendAndFail(user, "Richiamare domani", answer)

      expect(field().value).toBe("Richiamare domani")
      const alert = await screen.findByRole("alert")
      expect(alert.textContent).toBe(alertText)
      expect(field().getAttribute("aria-describedby")).toBe(alert.id)
      expect(notesWith("Richiamare domani")).toHaveLength(0)
      expect(mocks.updateCustomer).not.toHaveBeenCalled()
      expect(router.refresh).not.toHaveBeenCalled()
      expect(submit().getAttribute("aria-disabled")).not.toBe("true")
    }
  )

  it("con l'operatore non ancora caricato non chiama l'action e il testo resta", async () => {
    mocks.operator = undefined
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(updateChatAction).not.toHaveBeenCalled()
    expect(field().value).toBe("Richiamare domani")
    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(notesWith("Richiamare domani")).toHaveLength(0)
    expect(mocks.updateCustomer).not.toHaveBeenCalled()
  })

  it("il messaggio sparisce all'inizio del secondo invio e ricompare se fallisce di nuovo", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", new Error("Failed to fetch"))
    await screen.findByRole("alert")

    // Second send, still waiting for the answer
    await user.click(submit())
    expect(failure()).toBeNull()

    await act(async () => {
      mocks.updateChat[0]!({ error: "Invalid form data" })
    })
    expect(failure()?.textContent).toBe(alertText)
    expect(field().value).toBe("Richiamare")
  })

  it("il testo scritto durante l'invio resta, sotto quello non inviato", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Non inviata")
    await user.click(submit())
    await user.type(field(), "Scritta dopo")
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect(field().value).toBe("Non inviata\nScritta dopo")
  })

  it("dopo un fallimento, un invio riuscito toglie il messaggio e svuota il campo", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", new Error("Failed to fetch"))
    await screen.findByRole("alert")

    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 903 })
    })

    expect(failure()).toBeNull()
    expect(field().value).toBe("")
    expect(notesWith("Richiamare")).toHaveLength(1)
  })

  it("un invio riuscito non mostra il messaggio e lascia il campo vuoto", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Tutto bene")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 904 })
    })

    expect(failure()).toBeNull()
    expect(field().value).toBe("")
    expect(field().getAttribute("aria-describedby")).toBeNull()
  })
})

const draftKey = (customerId: string) => `mito:nota-non-inviata:${customerId}`
type StoredDraft = { operatorId: number | null; text: string }
const storedDraft = (customerId: string): StoredDraft | null => {
  const raw = window.sessionStorage.getItem(draftKey(customerId))
  return raw === null ? null : (JSON.parse(raw) as StoredDraft)
}
/** A reload: the memory of the page is gone, the tab's storage stays. */
const clearChatMemory = () => {
  const saved: Record<string, string> = { ...window.sessionStorage }
  clearUnsentNotes()
  for (const [key, value] of Object.entries(saved)) {
    window.sessionStorage.setItem(key, value)
  }
}
/** The text of the draft the chat saved for the customer. */
const draftOf = (customerId: string) => storedDraft(customerId)?.text ?? null
/** A draft left by an earlier chat, written by `operatorId` (11 is the session's). */
const storeDraft = (
  customerId: string,
  text: string,
  operatorId: number | null = 11
) =>
  window.sessionStorage.setItem(
    draftKey(customerId),
    JSON.stringify({ operatorId, text })
  )

describe("CustomerChat, bozza della nota non inviata (AC76, D18)", () => {
  const storageSpies: Array<{ mockRestore: () => void }> = []
  afterEach(() => {
    storageSpies.forEach((spy) => spy.mockRestore())
    storageSpies.length = 0
  })

  it("dopo un fallimento la bozza è salvata per il cliente", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare domani", undefined)
    await screen.findByRole("alert")

    expect(draftOf("c-42")).toBe("Richiamare domani")
  })

  it("rimontando la chat dello stesso cliente il testo torna nel campo con il messaggio", async () => {
    storeDraft("c-42", "Richiamare domani")
    renderChat([note(1, "Prima nota")])

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe(alertText)
    expect(field().value).toBe("Richiamare domani")
    expect(field().getAttribute("aria-describedby")).toBe(alert.id)
  })

  it("la bozza di un altro cliente non compare", async () => {
    storeDraft("c-99", "Di un altro cliente")
    renderChat([note(1, "Prima nota")])

    // Past the mount effects
    await act(async () => undefined)
    expect(field().value).toBe("")
    expect(failure()).toBeNull()
  })

  it("un invio riuscito dopo un fallimento cancella la bozza", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 905 })
    })

    expect(draftOf("c-42")).toBeNull()
  })

  it("svuotando il campo dopo un fallimento la bozza si cancella", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    await user.clear(field())

    expect(draftOf("c-42")).toBeNull()
    // New text after that was never sent: not a draft
    await user.type(field(), "Altro")
    expect(draftOf("c-42")).toBeNull()
  })

  it("cambiando il testo dopo un fallimento la bozza segue il campo", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    await user.type(field(), " alle 18")

    expect(draftOf("c-42")).toBe("Richiamare alle 18")
  })

  it("scrivendo durante il nuovo invio di una bozza, la bozza tiene anche il testo in volo", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    // Sent again, still waiting for the answer
    await user.click(submit())
    await user.type(field(), "Nuovo")

    expect(draftOf("c-42")).toBe("Richiamare\nNuovo")
  })

  it("se il fallimento arriva dopo che la chat si è chiusa, la bozza c'è e torna alla riapertura", async () => {
    const { unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Chiusa durante l'invio")
    await user.click(submit())
    // The customer sheet closes while the action is still running
    unmount()
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect(draftOf("c-42")).toBe("Chiusa durante l'invio")
    renderChat([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("Chiusa durante l'invio")
  })

  it("se il fallimento arriva dopo che la chat è stata riaperta, il testo compare nella chat aperta e non si perde scrivendo", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Testo fallito")
    await user.click(submit())
    // Closed and opened again while the action is still running
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(field().value).toBe("Testo fallito")
    await user.type(field(), " x")
    expect(draftOf("c-42")).toBe("Testo fallito x")
  })

  it("con l'operatore non ancora caricato il testo resta anche ricaricando", async () => {
    mocks.operator = undefined
    const { unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Senza operatore")
    await user.click(submit())
    expect(draftOf("c-42")).toBe("Senza operatore")

    unmount()
    clearChatMemory()
    mocks.operator = { id: 11 }
    renderChat([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("Senza operatore")
  })

  it("il testo scritto e mai inviato non diventa una bozza", async () => {
    const { unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Solo scritto")
    expect(draftOf("c-42")).toBeNull()

    unmount()
    renderChat([note(1, "Prima nota")])
    await act(async () => undefined)
    expect(field().value).toBe("")
    expect(failure()).toBeNull()
  })

  it("la bozza è dell'operatore che l'ha scritta", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Mia", undefined)
    await screen.findByRole("alert")

    expect(storedDraft("c-42")?.operatorId).toBe(11)
  })

  it("la bozza di un altro operatore non compare e si cancella", async () => {
    // Left in the same tab by a colleague who signed out, or whose session expired
    storeDraft("c-42", "Di un collega", 99)
    renderChat([note(1, "Prima nota")])

    await act(async () => undefined)
    expect(field().value).toBe("")
    expect(failure()).toBeNull()
    expect(draftOf("c-42")).toBeNull()
  })

  it("un invio riuscito non cancella la bozza che la chat ha preso da un'altra chat nel frattempo", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "X")
    await user.click(submit())
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await user.type(field(), "Y")
    await user.click(submit())
    // Next answers the actions in order: the closed chat's first
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })
    expect(field().value).toBe("X")
    await act(async () => {
      mocks.updateChat[1]!({ ok: true, id: 907 })
    })

    expect(field().value).toBe("X")
    expect(draftOf("c-42")).toBe("X")
    await user.type(field(), "!")
    expect(draftOf("c-42")).toBe("X!")
  })

  it("dopo un ricaricamento la bozza aspetta l'operatore e poi torna nel campo", async () => {
    storeDraft("c-42", "Bozza")
    mocks.operator = undefined
    const { reload } = renderChat([note(1, "Prima nota")])

    await act(async () => undefined)
    expect(draftOf("c-42")).toBe("Bozza")
    expect(field().value).toBe("")

    mocks.operator = { id: 11 }
    reload([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("Bozza")
  })

  it("con gli effetti doppi di StrictMode la bozza non si ripete", async () => {
    storeDraft("c-42", "Bozza")
    render(
      <StrictMode>
        <CollassableSection defaultValue={["item-1"]}>
          <CustomerChat
            customerId="c-42"
            chatId={3}
            messages={[note(1, "Prima nota")]}
            total={1}
            limit={5}
          />
        </CollassableSection>
      </StrictMode>
    )

    await screen.findByRole("alert")
    expect(field().value).toBe("Bozza")
    expect(draftOf("c-42")).toBe("Bozza")
  })

  it("senza operatore il testo non si ripete quando l'operatore arriva", async () => {
    mocks.operator = undefined
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "T")
    await user.click(submit())
    mocks.operator = { id: 11 }
    reload([note(1, "Prima nota")])
    await act(async () => undefined)

    expect(field().value).toBe("T")
    expect(storedDraft("c-42")).toEqual({ operatorId: 11, text: "T" })
  })

  it("inviando prima che l'operatore arrivi non si perde la bozza non ancora mostrata", async () => {
    storeDraft("c-42", "Originale")
    mocks.operator = undefined
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "abc")
    await user.click(submit())
    // Not checked yet: the stored draft stays as it is
    expect(draftOf("c-42")).toBe("Originale")
    mocks.operator = { id: 11 }
    reload([note(1, "Prima nota")])
    await act(async () => undefined)

    expect(field().value).toBe("Originale\nabc")
    expect(draftOf("c-42")).toBe("Originale\nabc")
  })

  it("con la bozza di un collega, il testo inviato prima che l'operatore arrivi resta anche ricaricando", async () => {
    storeDraft("c-42", "Di un collega", 99)
    mocks.operator = undefined
    const { reload, unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "abc")
    await user.click(submit())
    mocks.operator = { id: 11 }
    reload([note(1, "Prima nota")])
    await act(async () => undefined)
    expect(field().value).toBe("abc")
    expect(storedDraft("c-42")).toEqual({ operatorId: 11, text: "abc" })

    unmount()
    clearChatMemory()
    renderChat([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("abc")
  })

  it.each([
    ["fallisce", undefined, "D\nZ", "D\nZ"],
    ["riesce", { ok: true, id: 908 }, "Z", null],
  ])(
    "una bozza rinviata da una chat chiusa che %s non si ripete e non si perde",
    async (_case, answer, shown, draft) => {
      storeDraft("c-42", "D")
      const first = renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()
      await screen.findByRole("alert")

      await user.click(submit())
      first.unmount()
      renderChat([note(1, "Prima nota")])
      await user.type(field(), "Z")
      expect(draftOf("c-42")).toBe("D\nZ")
      await act(async () => {
        mocks.updateChat[0]!(answer)
      })

      expect(field().value).toBe(shown)
      expect(draftOf("c-42")).toBe(draft)
      expect(failure() !== null).toBe(draft !== null)
    }
  )

  it("svuotando il campo il messaggio sparisce", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    await user.clear(field())

    expect(failure()).toBeNull()
  })

  it("una nota nuova in volo non entra nella bozza presa da un'altra chat", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "X")
    await user.click(submit())
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await user.type(field(), "Y")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })
    await user.type(field(), "!")

    expect(draftOf("c-42")).toBe("X!")
  })

  it("il testo scritto nella chat aperta prima del fallimento della chat chiusa resta sotto", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "X")
    await user.click(submit())
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await user.type(field(), "Scritto qui")
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect(field().value).toBe("X\nScritto qui")
    expect(draftOf("c-42")).toBe("X\nScritto qui")
  })

  it("dopo un rinvio riuscito il testo nuovo non è una bozza", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare", undefined)
    await screen.findByRole("alert")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 909 })
    })
    await user.type(field(), "Nuovo")

    expect(draftOf("c-42")).toBeNull()
    expect(failure()).toBeNull()
  })

  it("senza operatore la bozza segue il campo", async () => {
    mocks.operator = undefined
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Senza")
    await user.click(submit())
    await user.type(field(), " operatore")

    expect(draftOf("c-42")).toBe("Senza operatore")
  })

  it.each([
    ["senza operatore", undefined],
    ["con un invio che fallisce", { id: 11 }],
  ])(
    "un campo vuoto inviato %s non mostra il messaggio e non fa una bozza",
    async (_case, operator) => {
      mocks.operator = operator
      // Only a loaded operator reaches the action
      if (operator) {
        vi.mocked(updateChatAction).mockImplementationOnce(() =>
          Promise.reject(new Error("Failed to fetch"))
        )
      }
      renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()

      await user.click(submit())
      await act(async () => undefined)
      expect(failure()).toBeNull()

      await user.type(field(), "mai inviato")
      expect(draftOf("c-42")).toBeNull()
    }
  )

  it("uscendo dal gestionale durante un invio, il fallimento non lascia niente al prossimo", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Di Federica")
    await user.click(submit())
    act(() => clearUnsentNotes())
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect(draftOf("c-42")).toBeNull()
    expect(field().value).toBe("")
    expect(failure()).toBeNull()
  })

  it("uscendo dal gestionale la chat aperta si svuota", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Da cancellare", undefined)
    await screen.findByRole("alert")
    act(() => clearUnsentNotes())

    expect(field().value).toBe("")
    expect(failure()).toBeNull()
  })

  it("se il browser blocca sessionStorage la chat funziona senza bozza", async () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError")
    }
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      storageSpies.push(
        vi.spyOn(Storage.prototype, method).mockImplementation(blocked)
      )
    }
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, "Richiamare domani", undefined)

    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(field().value).toBe("Richiamare domani")
    await user.clear(field())
    await user.type(field(), "Di nuovo")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 906 })
    })
    expect(failure()).toBeNull()
  })
})
