import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode, Suspense, useState } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Message } from "@mito/domain/schemas"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerChat, CustomerNewChat, CustomerNotes } from "../CustomerChat"
import { CustomerChatSection } from "../CustomerChatSection"
import { updateChatAction } from "../_actions/updateChat"
import { deleteMessageAction } from "../_actions/deleteMessage"
import { clearUnsentNotes } from "../unsentNote"
import { clearDeletingNotes } from "../deletingNotes"

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
  operator: { id: 11, role: "OPERATORE" } as
    | { id: number; role: "ADMIN" | "OPERATORE" }
    | undefined,
  // Called by each note at each of its renders
  noteRender: vi.fn(),
  // What the lookup of the author of a note answers
  author: {
    data: { name: "Federica", surname: "Rossi" },
    isLoading: false,
  } as {
    data: { name: string; surname: string } | undefined
    isLoading: boolean
  },
  // What the server reads for CustomerChatSection
  server: { chatId: null as number | null, messages: [] as unknown[] },
}))

vi.mock("@/trpc/server", () => ({
  api: {
    customer: {
      getCustomerById: {
        query: async () => ({ id: "c-42", chatId: mocks.server.chatId }),
      },
    },
    chat: {
      getChatMessagesById: {
        query: async () => ({
          messages: mocks.server.messages,
          total: mocks.server.messages.length,
        }),
      },
    },
  },
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getUserOperator: { useQuery: () => ({ data: mocks.operator }) },
      getOperatorById: {
        useQuery: () => {
          mocks.noteRender()
          return mocks.author
        },
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
const toastApi = { toast: vi.fn() }
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => toastApi }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

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

function renderChat(
  messages: Note[] | null,
  total = messages?.length ?? 0,
  limit = 5
) {
  // `null`: the customer has no chat any more, as CustomerChatSection draws it
  const view = (current: Note[] | null, currentTotal: number) => (
    <CustomerNotes>
      {current ? (
        <CollassableSection defaultValue={["item-1"]}>
          <CustomerChat
            customerId="c-42"
            chatId={3}
            messages={current}
            total={currentTotal}
            limit={limit}
          />
        </CollassableSection>
      ) : (
        <CustomerNewChat customerId="c-42" />
      )}
    </CustomerNotes>
  )
  const result = render(view(messages, total))
  return {
    ...result,
    // The page drawn again by the server after the action
    reload: (next: Note[] | null, nextTotal = next?.length ?? 0) =>
      result.rerender(view(next, nextTotal)),
  }
}

const field = () => screen.getByRole<HTMLTextAreaElement>("textbox")
const status = () => screen.getByRole("status")
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
  mocks.operator = { id: 11, role: "OPERATORE" }
  mocks.author = {
    data: { name: "Federica", surname: "Rossi" },
    isLoading: false,
  }
  mocks.server = { chatId: null, messages: [] }
  // Unsent notes outlive the chat (T4.4): not from one test to the next
  window.sessionStorage.clear()
  clearUnsentNotes()
  // Deletions outlive the chat too
  clearDeletingNotes()
  // The chat in the customer's page
  window.history.pushState({}, "", "/dashboard/customers/c-42")
})

describe("CustomerChat, l'autore di una nota che non c'è ancora (M11, P17)", () => {
  // The note is on screen at once; the author's name comes when it is there.
  // A skeleton pulses for ever if the lookup never answers

  it("mentre cerca l'autore mostra già la nota, senza scheletro", () => {
    mocks.author = { data: undefined, isLoading: true }

    renderChat([note(1, "Richiamare dopo le 15")])

    expect(notesWith("Richiamare dopo le 15")).toHaveLength(1)
    expect(document.querySelector(".animate-pulse")).toBeNull()
    expect(screen.queryByRole("heading", { level: 6 })).toBeNull()
  })

  it("se la ricerca dell'autore fallisce la nota resta, senza scheletro e senza nome", () => {
    mocks.author = { data: undefined, isLoading: false }

    renderChat([note(1, "Richiamare dopo le 15")])

    expect(notesWith("Richiamare dopo le 15")).toHaveLength(1)
    expect(document.querySelector(".animate-pulse")).toBeNull()
    expect(screen.queryByRole("heading", { level: 6 })).toBeNull()
  })

  it("quando l'autore c'è il nome compare accanto alla data", () => {
    renderChat([note(1, "Richiamare dopo le 15")])

    expect(
      screen.getByRole("heading", { level: 6, name: "Federica Rossi" })
    ).toBeTruthy()
  })
})

describe("CustomerChat, invio di una nota", () => {
  it("aggiorna l'ultima modifica del cliente e non della pratica", async () => {
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

describe("CustomerChat, nota salvata prima della risposta", () => {
  it("se la pagina mostra la nota prima che l'action risponda, eliminata dopo non ricompare", async () => {
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Nuova nota")
    await user.click(submit())
    // Another refresh (a note deleted meanwhile) draws the saved note first
    reload([note(1, "Prima nota"), note(9, "Nuova nota")])
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 9 })
    })
    expect(notesWith("Nuova nota")).toHaveLength(1)

    // Deleted later: the page drops it, and nothing brings it back
    reload([note(1, "Prima nota")])

    expect(notesWith("Nuova nota")).toHaveLength(0)
  })
})

describe("CustomerChat, chi può eliminare una nota", () => {
  const trashes = (text: string) =>
    within(screen.getByText(text).closest("article")!).queryAllByRole(
      "button",
      { name: "Elimina nota" }
    )
  const ofColleague = { ...note(2, "Nota di un collega"), operatorId: 12 }

  it("un operatore ha il cestino sulle sue note e non su quelle di un collega", () => {
    renderChat([note(1, "Mia nota"), ofColleague])

    expect(trashes("Mia nota")).toHaveLength(1)
    expect(trashes("Nota di un collega")).toHaveLength(0)
  })

  it("anche un amministratore ha il cestino solo sulle sue note", () => {
    mocks.operator = { id: 11, role: "ADMIN" }
    renderChat([note(1, "Mia nota"), ofColleague])

    expect(trashes("Mia nota")).toHaveLength(1)
    expect(trashes("Nota di un collega")).toHaveLength(0)
  })

  it("finché l'operatore non è caricato nessuna nota ha il cestino", () => {
    mocks.operator = undefined
    renderChat([note(1, "Mia nota")])

    expect(trashes("Mia nota")).toHaveLength(0)
  })

  it("eliminata una nota, il focus va al cestino della nota dopo che l'operatore può eliminare", async () => {
    // The colleague's note before it has no trash: it doesn't count
    const { reload } = renderChat([
      ofColleague,
      note(3, "Terza nota"),
      note(4, "Quarta nota"),
      note(5, "Quinta nota"),
    ])
    const user = userEvent.setup()

    await user.click(trashes("Terza nota")[0]!)
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([ofColleague, note(4, "Quarta nota"), note(5, "Quinta nota")])

    expect(document.activeElement).toBe(trashes("Quarta nota")[0])
  })
})

describe("CustomerChat, eliminazione di una nota", () => {
  it("aggiorna l'ultima modifica del cliente e non della pratica", async () => {
    renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
    const user = userEvent.setup()

    const saved = screen.getByText("Seconda nota").closest("article")!
    await user.hover(saved)
    await user.click(within(saved).getByRole("button"))

    expect(deleteMessageAction).toHaveBeenCalledWith({
      id: 2,
      customerId: "c-42",
    })
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })

    expect(mocks.updateCustomer).toHaveBeenCalledWith({ id: "c-42" })
    expect(mocks.updatePratica).not.toHaveBeenCalled()
  })
})

describe("CustomerChat, attesa dell'invio", () => {
  it("la nota in attesa dice 'Invio…' finché il server non risponde", async () => {
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    const pending = screen.getByText("Richiamare domani").closest("article")!
    expect(pending.getAttribute("aria-busy")).toBe("true")
    expect(within(pending).getByText("Invio…")).toBeTruthy()
    expect(status().textContent).toBe("Invio della nota")

    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })
    reload([note(1, "Prima nota"), note(901, "Richiamare domani")])

    const saved = screen.getByText("Richiamare domani").closest("article")!
    expect(saved.getAttribute("aria-busy")).not.toBe("true")
    expect(within(saved).queryByText("Invio…")).toBeNull()
    expect(status().textContent).toBe("Nota inviata")
  })

  it("'Commenta' ha lo spinner e aria-busy durante l'invio", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(submit().getAttribute("aria-busy")).toBe("true")
    const spinner = submit().querySelector("svg.animate-spin")
    expect(spinner?.getAttribute("class")).toContain(
      "motion-reduce:animate-none"
    )

    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })
    expect(submit().getAttribute("aria-busy")).not.toBe("true")
    expect(submit().querySelector("svg")).toBeNull()
  })

  it("se l'invio fallisce la nota in attesa sparisce e lo stato non dice 'Nota inviata'", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!(undefined)
    })

    expect(screen.queryByText("Invio…")).toBeNull()
    expect(status().textContent).toBe("")
  })
})

describe("CustomerChat, invio con StrictMode", () => {
  it("con gli effetti doppi di StrictMode la nota parte e si annuncia una volta", async () => {
    render(
      <StrictMode>
        <CustomerNotes>
          <CollassableSection defaultValue={["item-1"]}>
            <CustomerChat
              customerId="c-42"
              chatId={3}
              messages={[note(1, "Prima nota")]}
              total={1}
              limit={5}
            />
          </CollassableSection>
        </CustomerNotes>
      </StrictMode>
    )
    const user = userEvent.setup()
    const announced: string[] = []
    new MutationObserver(() =>
      announced.push(status().textContent ?? "")
    ).observe(status(), { childList: true, subtree: true, characterData: true })

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })

    expect(updateChatAction).toHaveBeenCalledTimes(1)
    expect(announced).toEqual(["Invio della nota", "Nota inviata"])
  })
})

describe("CustomerChat, note e campo", () => {
  it("scrivere nel campo non ridisegna le note", async () => {
    renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()
    await user.click(field())
    mocks.noteRender.mockClear()

    await user.keyboard("Ciao!")

    expect(field().value).toBe("Ciao!")
    expect(mocks.noteRender).not.toHaveBeenCalled()
  })
})

describe("CustomerChat, scroll della lista", () => {
  let scrolled: Array<{ element: Element; top: number }>
  beforeEach(() => {
    scrolled = []
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(480)
    vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(
      function (this: Element, top: number) {
        scrolled.push({ element: this, top })
      }
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const list = () => screen.getByText("Prima nota").closest(".overflow-y-auto")!
  const listScrolls = () =>
    scrolled.filter((entry) => entry.element === list()).map((e) => e.top)

  it("all'apertura la lista mostra le note più recenti, in fondo", () => {
    renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])

    expect(listScrolls()).toEqual([480])
  })

  it("dopo l'invio la lista scorre fino alla nota appena inviata, e di nuovo quando arriva salvata", async () => {
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()
    scrolled.length = 0

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    expect(listScrolls()).toEqual([480])

    await act(async () => {
      mocks.updateChat[0]!({ ok: true, id: 901 })
    })
    reload([note(1, "Prima nota"), note(901, "Richiamare domani")])
    expect(listScrolls()).toEqual([480, 480])
  })

  describe("quando le note cambiano altezza (nomi caricati dopo l'apertura)", () => {
    let resized: (() => void) | undefined
    beforeEach(() => {
      resized = undefined
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            resized = callback
          }
          observe() {
            return undefined
          }
          disconnect() {
            return undefined
          }
        }
      )
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("la lista resta in fondo", () => {
      renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
      scrolled.length = 0

      act(() => resized?.())

      expect(listScrolls()).toEqual([480])
    })

    it("se l'operatore ha scorso in su, la lista resta dov'è", () => {
      renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
      scrolled.length = 0

      // Away from the bottom: scrollTop 0, scrollHeight 480
      fireEvent.scroll(list())
      act(() => resized?.())

      expect(listScrolls()).toEqual([])
    })
  })

  describe("se l'operatore ha scorso in su", () => {
    const scrollUp = () => {
      // Away from the bottom: scrollTop 0, scrollHeight 480
      fireEvent.scroll(list())
      scrolled.length = 0
    }

    it("la nota di un collega in arrivo non la fa scorrere", () => {
      const { reload } = renderChat([note(1, "Prima nota")])
      scrollUp()

      reload([
        note(1, "Prima nota"),
        { ...note(2, "Del collega"), operatorId: 12 },
      ])

      expect(listScrolls()).toEqual([])
    })

    it("eliminare l'ultima nota non la fa scorrere", () => {
      const { reload } = renderChat([
        note(1, "Prima nota"),
        note(2, "Seconda nota"),
      ])
      scrollUp()

      reload([note(1, "Prima nota")])

      expect(listScrolls()).toEqual([])
    })

    it("inviando una nota la lista torna in fondo", async () => {
      renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()
      scrollUp()

      await user.type(field(), "Richiamare domani")
      await user.click(submit())

      expect(listScrolls()).toEqual([480])
    })
  })

  it("scrivere nel campo non fa scorrere la lista", async () => {
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()
    scrolled.length = 0

    await user.type(field(), "Testo")

    expect(listScrolls()).toEqual([])
  })

  it("'Carica altri messaggi' non fa scorrere niente", async () => {
    renderChat([note(1, "Prima nota")], 12, 5)
    const user = userEvent.setup()
    scrolled.length = 0

    await user.click(
      screen.getByRole("button", { name: "Carica altri messaggi" })
    )

    expect(router.replace).toHaveBeenCalled()
    expect(scrolled).toEqual([])
  })
})

describe("CustomerChat, attesa dell'eliminazione", () => {
  const trash = (text: string) =>
    within(
      screen.getByText(text).closest("article")!
    ).getByRole<HTMLButtonElement>("button", { name: "Elimina nota" })

  it("durante l'eliminazione la nota resta, con lo spinner al posto del cestino, e un secondo clic non parte", async () => {
    renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(trash("Seconda nota"))

    expect(deleteMessageAction).toHaveBeenCalledTimes(1)
    const row = screen.getByText("Seconda nota").closest("article")!
    expect(row.getAttribute("aria-busy")).toBe("true")
    expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
    expect(trash("Seconda nota").getAttribute("aria-disabled")).toBe("true")
    expect(
      trash("Seconda nota").querySelector("svg.animate-spin")
    ).not.toBeNull()
    // Shown without hover while busy
    expect(trash("Seconda nota").className).toContain("opacity-100")
  })

  it("quando la nota è eliminata sparisce, lo stato dice 'Nota eliminata' e il focus va al cestino della nota dopo", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    // Still there until the page is drawn again: nothing removed in advance
    expect(screen.getByText("Seconda nota")).toBeTruthy()

    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(screen.queryByText("Seconda nota")).toBeNull()
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(trash("Terza nota"))
    expect(toastApi.toast).not.toHaveBeenCalled()
  })

  it("due eliminazioni di fila sono annunciate entrambe", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Terza nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(2, "Seconda nota")])
    const first = status().firstElementChild
    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[1]!({ ok: true })
    })
    reload([note(1, "Prima nota")])

    // A screen reader reads what is added to the region: the same text in the
    // same node would be silent
    expect(status().textContent).toBe("Nota eliminata")
    expect(status().firstElementChild).not.toBe(first)
    expect(first?.isConnected).toBe(false)
  })

  it("due eliminazioni in corso insieme sono annunciate entrambe", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(trash("Terza nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])
    expect(status().textContent).toBe("Nota eliminata")
    const first = status().firstElementChild

    await act(async () => {
      mocks.deleteMessage[1]!({ ok: true })
    })
    reload([note(1, "Prima nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(first?.isConnected).toBe(false)
  })

  it("eliminata l'unica nota la chat lascia il posto ad 'Avvia una chat': lo stato dice 'Nota eliminata' e il focus va al pulsante", async () => {
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.click(trash("Prima nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    // The server deleted the chat with its last note
    reload(null)

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Avvia una chat" })
    )
  })

  it("eliminata l'unica nota nella sezione del cliente, la regione di stato resta la stessa e il focus va ad 'Avvia una chat'", async () => {
    mocks.server = { chatId: 3, messages: [note(1, "Prima nota")] }
    const section = () => CustomerChatSection({ customerId: "c-42" })
    const { rerender } = render(await section())
    const region = status()
    const user = userEvent.setup()

    await user.click(trash("Prima nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    // The server deleted the chat with its last note
    mocks.server = { chatId: null, messages: [] }
    rerender(await section())

    expect(status()).toBe(region)
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Avvia una chat" })
    )
  })

  it("due note sparite con un solo aggiornamento: lo stato dice 'Note eliminate' e il focus va accanto all'ultima eliminata", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
      note(4, "Quarta nota"),
      note(5, "Quinta nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(trash("Quarta nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
      mocks.deleteMessage[1]!({ ok: true })
    })
    reload([
      note(1, "Prima nota"),
      note(3, "Terza nota"),
      note(5, "Quinta nota"),
    ])

    expect(status().textContent).toBe("Note eliminate")
    // The focus was on the fourth note's trash
    expect(document.activeElement).toBe(trash("Quinta nota"))
  })

  it("se durante l'eliminazione l'operatore è passato al campo, il focus resta lì", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(field())
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(field())
  })

  it("chiudendo e riaprendo 'Note' durante l'eliminazione l'attesa resta e un secondo clic non parte", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()
    // The chevron of "Note": a button with no name, open or closed
    const toggle = () =>
      document.querySelector<HTMLButtonElement>("button[aria-expanded]")!

    await user.click(trash("Seconda nota"))
    await user.click(toggle())
    expect(screen.queryByText("Seconda nota")).toBeNull()
    await user.click(toggle())

    expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
    await user.click(trash("Seconda nota"))
    expect(deleteMessageAction).toHaveBeenCalledTimes(1)

    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota")])
    expect(status().textContent).toBe("Nota eliminata")
    expect(toastApi.toast).not.toHaveBeenCalled()
  })

  it("se la nota era già eliminata in un'altra scheda, niente errore: l'attesa resta finché la pagina non la toglie", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: false, gone: true })
    })

    expect(toastApi.toast).not.toHaveBeenCalled()
    expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
    expect(mocks.updateCustomer).not.toHaveBeenCalled()

    reload([note(1, "Prima nota")])
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("dopo un'eliminazione fallita, la nota tolta poi da un'altra scheda non è annunciata", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: false, error: "Invalid form data" })
    })
    reload([note(1, "Prima nota")])

    expect(status().textContent).toBe("")
  })

  it("passando a un altro cliente non resta niente del precedente: né l'annuncio, né la nota in invio", async () => {
    mocks.server = {
      chatId: 3,
      messages: [note(1, "Prima nota"), note(2, "Seconda nota")],
    }
    const { rerender } = render(
      await CustomerChatSection({ customerId: "c-42" })
    )
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await user.click(trash("Seconda nota"))
    // The operator opens another customer while both are still running
    mocks.server = {
      chatId: 8,
      messages: [note(5, "Nota di un altro cliente")],
    }
    rerender(await CustomerChatSection({ customerId: "c-43" }))

    expect(status().textContent).toBe("")
    expect(notesWith("Richiamare domani")).toHaveLength(0)
  })

  describe("cambiando cliente durante l'eliminazione", () => {
    const c42 = [note(1, "Prima nota"), note(2, "Seconda nota")]
    const c43 = [note(5, "Nota di un altro cliente")]
    const show = async (customerId: string, messages: Note[]) => {
      mocks.server = { chatId: customerId === "c-42" ? 3 : 8, messages }
      return CustomerChatSection({ customerId })
    }

    it("tornando al cliente l'attesa c'è ancora e un secondo clic non parte", async () => {
      const { rerender } = render(await show("c-42", c42))
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      rerender(await show("c-43", c43))
      rerender(await show("c-42", c42))

      expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
      await user.click(trash("Seconda nota"))
      expect(deleteMessageAction).toHaveBeenCalledTimes(1)

      await act(async () => {
        mocks.deleteMessage[0]!({ ok: true })
      })
      rerender(await show("c-42", [note(1, "Prima nota")]))
      expect(status().textContent).toBe("Nota eliminata")
    })

    it("se l'eliminazione fallisce sulla pagina di un altro cliente, niente errore lì; tornando il cestino è di nuovo attivo", async () => {
      const { rerender } = render(await show("c-42", c42))
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      rerender(await show("c-43", c43))
      await act(async () => {
        mocks.deleteMessage[0]!({ ok: false, error: "Invalid form data" })
      })

      expect(toastApi.toast).not.toHaveBeenCalled()
      rerender(await show("c-42", c42))
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
    })

    it("se l'eliminazione fallisce dopo il ritorno al cliente, compare l'errore", async () => {
      const { rerender } = render(await show("c-42", c42))
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      rerender(await show("c-43", c43))
      rerender(await show("c-42", c42))
      await act(async () => {
        mocks.deleteMessage[0]!({ ok: false, error: "Invalid form data" })
      })

      expect(toastApi.toast).toHaveBeenCalledTimes(1)
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
    })
  })

  it("se dopo il clic sul cestino l'operatore clicca altrove, il focus resta dove l'ha messo", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(document.body)
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(document.body)
  })

  it("se durante l'eliminazione l'operatore va altrove con la tastiera, il focus resta lì", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(trash("Prima nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("se il clic sul cestino non gli ha dato il focus (Safari), il focus non si sposta", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])

    // A click event alone: no pointer, no focus
    fireEvent.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(document.body)
  })

  it("un secondo clic sul cestino occupato non cambia dove va il focus", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.dblClick(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(document.activeElement).toBe(trash("Terza nota"))
  })

  it("eliminata l'ultima nota, il focus va al cestino della precedente più vicina", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Terza nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota"), note(2, "Seconda nota")])

    expect(document.activeElement).toBe(trash("Seconda nota"))
  })

  it("con gli effetti doppi di StrictMode un'eliminazione parte e si annuncia una volta", async () => {
    const view = (messages: Note[]) => (
      <StrictMode>
        <CustomerNotes>
          <CollassableSection defaultValue={["item-1"]}>
            <CustomerChat
              customerId="c-42"
              chatId={3}
              messages={messages}
              total={messages.length}
              limit={5}
            />
          </CollassableSection>
        </CustomerNotes>
      </StrictMode>
    )
    const { rerender } = render(
      view([note(1, "Prima nota"), note(2, "Seconda nota")])
    )
    const user = userEvent.setup()
    const announced: string[] = []
    new MutationObserver(() =>
      announced.push(status().textContent ?? "")
    ).observe(status(), { childList: true, subtree: true, characterData: true })

    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    rerender(view([note(1, "Prima nota")]))
    await act(async () => undefined)

    expect(deleteMessageAction).toHaveBeenCalledTimes(1)
    expect(announced.filter((text) => text === "Nota eliminata")).toHaveLength(
      1
    )
    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("eliminata l'ultima nota, il focus va al cestino della precedente", async () => {
    const { reload } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await act(async () => {
      mocks.deleteMessage[0]!({ ok: true })
    })
    reload([note(1, "Prima nota")])

    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it.each([
    ["rifiuta", new Error("Failed to fetch")],
    ["restituisce un errore", { ok: false, error: "Invalid form data" }],
    ["risolve senza risultato", undefined],
  ])(
    "se l'action %s compare 'Nota non eliminata, riprova' e il cestino torna",
    async (_case, answer) => {
      renderChat([note(1, "Prima nota"), note(2, "Seconda nota")])
      const user = userEvent.setup()
      vi.mocked(deleteMessageAction).mockImplementationOnce(() =>
        answer instanceof Error
          ? Promise.reject(answer)
          : Promise.resolve(answer as never)
      )

      await user.click(trash("Seconda nota"))
      await act(async () => undefined)

      expect(toastApi.toast).toHaveBeenCalledWith({
        variant: "destructive",
        duration: 8000,
        description: "Nota non eliminata, riprova",
      })
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
      expect(trash("Seconda nota").querySelector("svg.animate-spin")).toBeNull()
      expect(mocks.updateCustomer).not.toHaveBeenCalled()
      expect(status().textContent).toBe("")
    }
  )

  it("il cestino si raggiunge da tastiera", () => {
    renderChat([note(1, "Prima nota")])

    const button = trash("Prima nota")
    expect(button.closest(".invisible")).toBeNull()
    expect(button.className).toContain("focus-visible:opacity-100")
  })
})

describe("CustomerNewChat, avvio della chat", () => {
  const start = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "Avvia una chat" })

  it("crea la chat una volta sola, anche con un doppio clic", async () => {
    render(
      <CustomerNotes>
        <CustomerNewChat customerId="c-42" />
      </CustomerNotes>
    )
    const user = userEvent.setup()

    await user.dblClick(start())

    expect(mocks.createChatMutate).toHaveBeenCalledTimes(1)
    expect(mocks.createChatMutate).toHaveBeenCalledWith({ customerId: "c-42" })
  })

  it("durante la creazione la scheda resta e il pulsante è occupato, con lo spinner", async () => {
    render(
      <CustomerNotes>
        <CustomerNewChat customerId="c-42" />
      </CustomerNotes>
    )
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
    render(
      <CustomerNotes>
        <CustomerNewChat customerId="c-42" />
      </CustomerNotes>
    )
    const user = userEvent.setup()

    await user.click(start())
    expect(router.refresh).not.toHaveBeenCalled()
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })

    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("il pulsante resta occupato finché la pagina aggiornata non è a schermo", async () => {
    // The refreshed page: suspended until its server payload arrives
    let arrive!: () => void
    const payload = new Promise<void>((resolve) => {
      arrive = resolve
    })
    let arrived = false
    void payload.then(() => {
      arrived = true
    })
    const Refreshed = () => {
      if (!arrived) throw payload
      return null
    }
    let draw!: () => void
    const Page = () => {
      const [refreshed, setRefreshed] = useState(false)
      draw = () => setRefreshed(true)
      return (
        <CustomerNotes>
          <CustomerNewChat customerId="c-42" />
          <Suspense fallback={null}>
            {refreshed ? <Refreshed /> : null}
          </Suspense>
        </CustomerNotes>
      )
    }
    router.refresh.mockImplementationOnce(() => draw())
    render(<Page />)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })

    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(start().getAttribute("aria-busy")).toBe("true")
    expect(start().querySelector("svg.animate-spin")).not.toBeNull()

    await act(async () => {
      arrive()
      await payload
    })

    expect(start().getAttribute("aria-busy")).not.toBe("true")
  })

  it("se la creazione fallisce compare 'Chat non avviata, riprova' e il pulsante torna attivo", async () => {
    render(
      <CustomerNotes>
        <CustomerNewChat customerId="c-42" />
      </CustomerNotes>
    )
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
    const { reload } = renderChat(null)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })
    // The refreshed page draws the chat in place of the button
    reload([])

    expect(document.activeElement).toBe(field())
  })

  it("se l'operatore esce prima che la chat avviata compaia, riaprendo il cliente la chat non prende il focus", async () => {
    const { unmount } = renderChat(null)
    const user = userEvent.setup()

    await user.click(start())
    await act(async () => {
      mocks.createChat[0]!.resolve({ id: 3 })
    })
    unmount()
    renderChat([])

    expect(document.activeElement).not.toBe(field())
  })

  it("una chat che c'era già non prende il focus", () => {
    renderChat([note(1, "Prima nota")])

    expect(document.activeElement).not.toBe(field())
  })

  it("se la creazione fallisce, la chat aperta dopo non prende il focus", async () => {
    const { unmount } = render(
      <CustomerNotes>
        <CustomerNewChat customerId="c-42" />
      </CustomerNotes>
    )
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
    mocks.operator = { id: 11, role: "OPERATORE" }
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

    mocks.operator = { id: 11, role: "OPERATORE" }
    reload([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("Bozza")
  })

  it("con gli effetti doppi di StrictMode la bozza non si ripete", async () => {
    storeDraft("c-42", "Bozza")
    render(
      <StrictMode>
        <CustomerNotes>
          <CollassableSection defaultValue={["item-1"]}>
            <CustomerChat
              customerId="c-42"
              chatId={3}
              messages={[note(1, "Prima nota")]}
              total={1}
              limit={5}
            />
          </CollassableSection>
        </CustomerNotes>
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
    mocks.operator = { id: 11, role: "OPERATORE" }
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
    mocks.operator = { id: 11, role: "OPERATORE" }
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
    mocks.operator = { id: 11, role: "OPERATORE" }
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
    ["con un invio che fallisce", { id: 11, role: "OPERATORE" as const }],
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
