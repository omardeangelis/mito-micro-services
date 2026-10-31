import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { type QueryClient } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { StrictMode, type ReactNode } from "react"
import { BrowserRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type ChatMessage } from "@mito/contract/chat"
import { MAX_CHAT_LIMIT } from "@mito/domain/constants/chat"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import {
  customerOf,
  type DeleteAnswer,
  fakeCustomers,
  operatorWithRole,
  type SendAnswer,
  type StartAnswer,
} from "@/test/customers"
import { expectToastLasts } from "@/test/toast"
import { CustomerChat, CustomerNewChat, CustomerNotes } from "../CustomerChat"
import { CustomerChatSection } from "../CustomerChatSection"
import { clearUnsentNotes } from "../unsentNote"
import { clearDeletingNotes } from "../deletingNotes"

// The notes of a customer (`CustomerChat.tsx` of the Next.js app) on a backend
// in memory: the writes of the notes wait for the test to answer them, as the
// server actions of the Next.js tests did, and "the page drawn again" is the
// chat given new notes (`reload`), or the section reading them again

/** The operator signed in, author of the notes `note` makes */
const OPERATOR = 11

const note = (id: number, content: string): ChatMessage => ({
  id,
  content,
  sendDate: new Date("2026-10-15T09:00:00Z"),
  operatorId: OPERATOR,
})

let backend: ReturnType<typeof fakeCustomers>
/** The operator of the current user, undefined while it loads */
let operatorId: number | undefined
let role: "ADMIN" | "OPERATORE"

beforeEach(() => {
  backend = fakeCustomers({
    operators: [
      operatorWithRole(OPERATOR, "Federica", "Rossi"),
      operatorWithRole(12, "Luca", "Bianchi"),
    ],
    customers: [
      customerOf({ id: "c-42", chatId: 3 }),
      customerOf({ id: "c-43", chatId: 8 }),
    ],
  })
  backend.state.holdNotes = true
  operatorId = OPERATOR
  role = "OPERATORE"
  // Unsent notes outlive the chat (T4.4): not from one test to the next
  window.sessionStorage.clear()
  clearUnsentNotes()
  // Deletions outlive the chat too
  clearDeletingNotes()
  // The chat in the customer's page
  window.history.pushState({}, "", "/dashboard/customers/c-42")
})

/**
 * Renders `ui` with the router and the operator of the session; `rerender`
 * draws it again with the operator `operatorId` says now
 */
function renderNotes(ui: ReactNode, { strict = false } = {}) {
  const store = createUserPreferenceStore({ role, operatorId })
  const wrap = (node: ReactNode) => {
    const tree = (
      <UserPreferenceContext value={store}>
        <BrowserRouter>{node}</BrowserRouter>
      </UserPreferenceContext>
    )
    return strict ? <StrictMode>{tree}</StrictMode> : tree
  }
  const result = renderWithApi(wrap(ui), {
    handlers: backend.handlers,
    auth: signedInAs({ ...ada, id: OPERATOR }, role),
  })
  return {
    ...result,
    rerender: (node: ReactNode) => {
      act(() => store.setState({ role, operatorId }))
      result.rerender(wrap(node))
    },
  }
}

const chatView = (
  current: ChatMessage[] | null,
  total: number,
  limit: number
) => (
  // `null`: the customer has no chat any more, as the section draws it
  <CustomerNotes>
    {current ? (
      <CollassableSection defaultValue={["item-1"]}>
        <CustomerChat
          customerId="c-42"
          chatId={3}
          messages={current}
          total={total}
          limit={limit}
        />
      </CollassableSection>
    ) : (
      <CustomerNewChat customerId="c-42" />
    )}
  </CustomerNotes>
)

function renderChat(
  messages: ChatMessage[] | null,
  total = messages?.length ?? 0,
  limit = 5,
  options: { strict?: boolean } = {}
) {
  const result = renderNotes(chatView(messages, total, limit), options)
  return {
    ...result,
    // The notes read again after a write
    reload: (next: ChatMessage[] | null, nextTotal = next?.length ?? 0) =>
      result.rerender(chatView(next, nextTotal, limit)),
  }
}

/** The section of the customer, as the customer's page draws it */
const section = (customerId: string) => (
  <CustomerChatSection key={customerId} customerId={customerId} />
)

const field = () => screen.getByRole<HTMLTextAreaElement>("textbox")
// The region of the notes: the toasts have their own
const status = () => document.querySelector<HTMLElement>('p[role="status"]')!
const submit = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Commenta" })
// The notes in the chat, not the text in the field
const notesWith = (text: string) =>
  screen.queryAllByText(text, { ignore: "script, style, textarea" })
const deleteToast = "Nota non eliminata, riprova"

/** A while for the calls under way to land: nothing else is coming */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

/** Until no write is under way, and its answer is on screen */
const settled = async (queryClient: QueryClient) => {
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  await flush()
}

/**
 * Answers the `index`-th call of `calls` once it reached the backend, then
 * waits until the chat took the answer: its write and the last edit that
 * follows are over. The other writes may still wait for their answer
 */
const answer =
  <A,>(
    name: string,
    calls: () => Array<object & { answer: (a?: A) => void }>
  ) =>
  async (queryClient: QueryClient, index: number, reply?: A) => {
    await waitFor(() => expect(calls()[index]).toBeDefined())
    const { answer: give, ...call } = calls()[index]!
    act(() => give(reply))
    const fields = call as Record<string, unknown>
    await waitFor(() => {
      const pending = queryClient
        .getMutationCache()
        .findAll({ mutationKey: ["chat", name], status: "pending" })
        .filter((mutation) =>
          Object.entries(mutation.state.variables as object).every(
            ([key, value]) => fields[key] === value
          )
        )
      expect(pending).toEqual([])
      expect(
        queryClient.isMutating({ mutationKey: ["customer", "updateLastEdit"] })
      ).toBe(0)
    })
    await flush()
  }
const answerSend = answer<SendAnswer>(
  "insertMessage",
  () => backend.state.sends
)
const answerDelete = answer<DeleteAnswer>(
  "deleteMessage",
  () => backend.state.deletes
)
const answerStart = answer<StartAnswer>(
  "createNewCustomerChat",
  () => backend.state.chatStarts
)

/** The notes sent, as the backend received them */
const sent = () =>
  backend.state.sends.map(({ chatId, content }) => ({ chatId, content }))

describe("CustomerChat, l'autore di una nota che non c'è ancora (M11, P17)", () => {
  // The note is on screen at once; the author's name comes when it is there.
  // A skeleton pulses for ever if the lookup never answers

  it("mentre cerca l'autore mostra già la nota, senza scheletro", async () => {
    backend.state.operatorGate = new Promise(() => undefined)

    renderChat([note(1, "Richiamare dopo le 15")])

    await waitFor(() => expect(backend.state.operatorReads).toEqual([OPERATOR]))
    expect(notesWith("Richiamare dopo le 15")).toHaveLength(1)
    expect(document.querySelector(".animate-pulse")).toBeNull()
    expect(screen.queryByRole("heading", { level: 6 })).toBeNull()
  })

  it("se la ricerca dell'autore fallisce la nota resta, senza scheletro, senza nome e senza toast", async () => {
    backend.state.failingOperator = true

    renderChat([note(1, "Richiamare dopo le 15")])

    // The first read and its three retries
    await waitFor(() => expect(backend.state.operatorReads).toHaveLength(4))
    await flush()
    expect(notesWith("Richiamare dopo le 15")).toHaveLength(1)
    expect(document.querySelector(".animate-pulse")).toBeNull()
    expect(screen.queryByRole("heading", { level: 6 })).toBeNull()
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })

  it("quando l'autore c'è il nome compare accanto alla data", async () => {
    renderChat([note(1, "Richiamare dopo le 15")])

    expect(
      await screen.findByRole("heading", { level: 6, name: "Federica Rossi" })
    ).toBeTruthy()
  })

  it("una nota con un operatorId che nessun operatore può avere non cerca l'autore e non mostra un nome (TD3 a)", async () => {
    renderChat([{ ...note(1, "Nota senza autore"), operatorId: 0 }])

    await flush()
    expect(notesWith("Nota senza autore")).toHaveLength(1)
    expect(backend.state.operatorReads).toEqual([])
    expect(screen.queryByRole("heading", { level: 6 })).toBeNull()
  })
})

describe("CustomerChat, invio di una nota", () => {
  it("aggiorna l'ultima modifica del cliente e non della pratica", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    await answerSend(queryClient, 0, { id: 901 })
    expect(sent()).toEqual([{ chatId: 3, content: "Richiamare domani" }])
    expect(backend.state.touched).toEqual(["c-42"])
  })

  it("la nota compare subito, il campo si svuota e 'Commenta' resta disabilitato fino alla risposta", async () => {
    const { reload, queryClient } = renderChat([note(1, "Prima nota")])
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
    await flush()
    expect(backend.state.sends).toHaveLength(1)

    await answerSend(queryClient, 0, { id: 901 })
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
    const { reload, queryClient } = renderChat(before, 12, 5)
    const user = userEvent.setup()

    await user.type(field(), "Richiamare")
    await user.click(submit())
    expect(notesWith("Richiamare")).toHaveLength(2)

    await answerSend(queryClient, 0, { id: 902 })

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
  it("se le note lette mostrano la nota prima della risposta, eliminata dopo non ricompare", async () => {
    const { reload, queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Nuova nota")
    await user.click(submit())
    // Another read (a note deleted meanwhile) draws the saved note first
    reload([note(1, "Prima nota"), note(9, "Nuova nota")])
    await answerSend(queryClient, 0, { id: 9 })
    expect(notesWith("Nuova nota")).toHaveLength(1)

    // Deleted later: the notes drop it, and nothing brings it back
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
    role = "ADMIN"
    renderChat([note(1, "Mia nota"), ofColleague])

    expect(trashes("Mia nota")).toHaveLength(1)
    expect(trashes("Nota di un collega")).toHaveLength(0)
  })

  it("finché l'operatore non è caricato nessuna nota ha il cestino", () => {
    operatorId = undefined
    renderChat([note(1, "Mia nota")])

    expect(trashes("Mia nota")).toHaveLength(0)
  })

  it("eliminata una nota, il focus va al cestino della nota dopo che l'operatore può eliminare", async () => {
    // The colleague's note before it has no trash: it doesn't count
    const { reload, queryClient } = renderChat([
      ofColleague,
      note(3, "Terza nota"),
      note(4, "Quarta nota"),
      note(5, "Quinta nota"),
    ])
    const user = userEvent.setup()

    await user.click(trashes("Terza nota")[0]!)
    await answerDelete(queryClient, 0, "deleted")
    reload([ofColleague, note(4, "Quarta nota"), note(5, "Quinta nota")])

    expect(document.activeElement).toBe(trashes("Quarta nota")[0])
  })
})

describe("CustomerChat, eliminazione di una nota", () => {
  it("elimina la nota e aggiorna l'ultima modifica del cliente e non della pratica", async () => {
    const { queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    const saved = screen.getByText("Seconda nota").closest("article")!
    await user.hover(saved)
    await user.click(within(saved).getByRole("button"))

    await answerDelete(queryClient, 0, "deleted")
    expect(backend.state.deletes.map(({ id }) => id)).toEqual([2])
    expect(backend.state.touched).toEqual(["c-42"])
  })
})

describe("CustomerChat, attesa dell'invio", () => {
  it("la nota in attesa dice 'Invio…' finché il server non risponde", async () => {
    const { reload, queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    const pending = screen.getByText("Richiamare domani").closest("article")!
    expect(pending.getAttribute("aria-busy")).toBe("true")
    expect(within(pending).getByText("Invio…")).toBeTruthy()
    expect(status().textContent).toBe("Invio della nota")

    await answerSend(queryClient, 0, { id: 901 })
    reload([note(1, "Prima nota"), note(901, "Richiamare domani")])

    const saved = screen.getByText("Richiamare domani").closest("article")!
    expect(saved.getAttribute("aria-busy")).not.toBe("true")
    expect(within(saved).queryByText("Invio…")).toBeNull()
    expect(status().textContent).toBe("Nota inviata")
  })

  it("'Commenta' ha lo spinner e aria-busy durante l'invio", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(submit().getAttribute("aria-busy")).toBe("true")
    const spinner = submit().querySelector("svg.animate-spin")
    expect(spinner?.getAttribute("class")).toContain(
      "motion-reduce:animate-none"
    )

    await answerSend(queryClient, 0, { id: 901 })
    expect(submit().getAttribute("aria-busy")).not.toBe("true")
    expect(submit().querySelector("svg")).toBeNull()
  })

  it("se l'invio fallisce la nota in attesa sparisce e lo stato non dice 'Nota inviata'", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await answerSend(queryClient, 0, "down")

    expect(screen.queryByText("Invio…")).toBeNull()
    expect(status().textContent).toBe("")
  })
})

describe("CustomerChat, invio con StrictMode", () => {
  it("con gli effetti doppi di StrictMode la nota parte e si annuncia una volta", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")], 1, 5, {
      strict: true,
    })
    const user = userEvent.setup()
    const announced: string[] = []
    new MutationObserver(() =>
      announced.push(status().textContent ?? "")
    ).observe(status(), { childList: true, subtree: true, characterData: true })

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await answerSend(queryClient, 0, { id: 901 })

    expect(backend.state.sends).toHaveLength(1)
    expect(announced).toEqual(["Invio della nota", "Nota inviata"])
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
    const { reload, queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()
    scrolled.length = 0

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    expect(listScrolls()).toEqual([480])

    await answerSend(queryClient, 0, { id: 901 })
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

    expect(new URLSearchParams(window.location.search).get("limit")).toBe("10")
    expect(scrolled).toEqual([])
  })
})

describe("CustomerChat, 'Carica altri messaggi' fino al massimo", () => {
  const loadMore = () =>
    screen.queryByRole("button", { name: "Carica altri messaggi" })

  it("l'ultimo passo chiede il massimo, non di più, e resta sull'indirizzo", async () => {
    window.history.pushState({}, "", "/dashboard/customers/c-42?tab=note")
    const before = window.history.length
    renderChat([note(1, "Prima nota")], MAX_CHAT_LIMIT + 10, MAX_CHAT_LIMIT - 2)
    const user = userEvent.setup()

    await user.click(loadMore()!)

    const params = new URLSearchParams(window.location.search)
    expect(params.get("limit")).toBe(String(MAX_CHAT_LIMIT))
    expect(params.get("tab")).toBe("note")
    expect(window.location.pathname).toBe("/dashboard/customers/c-42")
    // `replace`: the back button doesn't go through each step
    expect(window.history.length).toBe(before)
  })

  it("al massimo il bottone sparisce, anche se la chat ha altre note", () => {
    renderChat([note(1, "Prima nota")], MAX_CHAT_LIMIT + 10, MAX_CHAT_LIMIT)

    expect(loadMore()).toBeNull()
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
    await flush()

    expect(backend.state.deletes).toHaveLength(1)
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
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "deleted")
    // Still there until the notes are read again: nothing removed in advance
    expect(screen.getByText("Seconda nota")).toBeTruthy()

    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(screen.queryByText("Seconda nota")).toBeNull()
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(trash("Terza nota"))
    expect(screen.queryByText(deleteToast)).toBeNull()
  })

  it("due eliminazioni di fila sono annunciate entrambe", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Terza nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(2, "Seconda nota")])
    const first = status().firstElementChild
    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 1, "deleted")
    reload([note(1, "Prima nota")])

    // A screen reader reads what is added to the region: the same text in the
    // same node would be silent
    expect(status().textContent).toBe("Nota eliminata")
    expect(status().firstElementChild).not.toBe(first)
    expect(first?.isConnected).toBe(false)
  })

  it("due eliminazioni in corso insieme sono annunciate entrambe", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(trash("Terza nota"))
    await waitFor(() => expect(backend.state.deletes).toHaveLength(2))
    // The second trash's call first: whichever comes first, the first answered
    const second = backend.state.deletes.findIndex(({ id }) => id === 2)
    await answerDelete(queryClient, second, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])
    expect(status().textContent).toBe("Nota eliminata")
    const first = status().firstElementChild

    await answerDelete(queryClient, 1 - second, "deleted")
    reload([note(1, "Prima nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(first?.isConnected).toBe(false)
  })

  it("eliminata l'unica nota la chat lascia il posto ad 'Avvia una chat': lo stato dice 'Nota eliminata' e il focus va al pulsante", async () => {
    const { reload, queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.click(trash("Prima nota"))
    await answerDelete(queryClient, 0, "deleted")
    // The server deleted the chat with its last note
    reload(null)

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Avvia una chat" })
    )
  })

  it("eliminata l'unica nota nella sezione del cliente, la sezione legge di nuovo il cliente: la regione di stato resta la stessa e il focus va ad 'Avvia una chat'", async () => {
    backend.state.chats = { 3: [note(1, "Prima nota")] }
    renderNotes(section("c-42"))
    await screen.findByText("Prima nota")
    const region = status()
    const user = userEvent.setup()

    await user.click(trash("Prima nota"))
    await waitFor(() => expect(backend.state.deletes).toHaveLength(1))
    act(() => backend.state.deletes[0]!.answer("deleted"))

    // The server deleted the chat with its last note: the section reads the
    // customer again, with no chat
    await screen.findByRole("button", { name: "Avvia una chat" })
    expect(backend.state.customers[0]!.chatId).toBeNull()
    expect(status()).toBe(region)
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Avvia una chat" })
    )
  })

  it("eliminata l'unica nota, la sezione legge il cliente prima delle note: non disegna la chat vuota e il focus va comunque ad 'Avvia una chat'", async () => {
    backend.state.chats = { 3: [note(1, "Prima nota")] }
    renderNotes(section("c-42"))
    await screen.findByText("Prima nota")
    const user = userEvent.setup()
    // The customer answers late, after the notes would have
    let arrive!: () => void
    backend.state.customerGate = new Promise<void>((resolve) => {
      arrive = resolve
    })

    await user.click(trash("Prima nota"))
    await waitFor(() => expect(backend.state.deletes).toHaveLength(1))
    act(() => backend.state.deletes[0]!.answer("deleted"))
    await flush()

    // The notes wait for the customer: the old chat stays as it was
    expect(backend.state.chatReads).toHaveLength(1)
    expect(screen.queryByText("0 / 0")).toBeNull()
    expect(screen.getByText("Prima nota")).toBeTruthy()

    act(() => arrive())

    const start = await screen.findByRole("button", { name: "Avvia una chat" })
    await waitFor(() => expect(document.activeElement).toBe(start))
    expect(status().textContent).toBe("Nota eliminata")
  })

  it("due note sparite con un solo aggiornamento: lo stato dice 'Note eliminate' e il focus va accanto all'ultima eliminata", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
      note(4, "Quarta nota"),
      note(5, "Quinta nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(trash("Quarta nota"))
    await waitFor(() => expect(backend.state.deletes).toHaveLength(2))
    act(() => {
      backend.state.deletes[0]!.answer("deleted")
      backend.state.deletes[1]!.answer("deleted")
    })
    await settled(queryClient)
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
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(field())
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(field())
  })

  it("chiudendo e riaprendo 'Note' durante l'eliminazione l'attesa resta e un secondo clic non parte", async () => {
    const { reload, queryClient } = renderChat([
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
    await flush()
    expect(backend.state.deletes).toHaveLength(1)

    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota")])
    expect(status().textContent).toBe("Nota eliminata")
    expect(screen.queryByText(deleteToast)).toBeNull()
  })

  it("se la nota era già eliminata in un'altra scheda, niente errore: l'attesa resta finché le note lette non la tolgono", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "gone")

    expect(screen.queryByText(deleteToast)).toBeNull()
    expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
    expect(backend.state.touched).toEqual([])

    reload([note(1, "Prima nota")])
    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("dopo un'eliminazione fallita, la nota tolta poi da un'altra scheda non è annunciata", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "forbidden")
    reload([note(1, "Prima nota")])

    expect(status().textContent).toBe("")
  })

  it("passando a un altro cliente non resta niente del precedente: né l'annuncio, né la nota in invio", async () => {
    backend.state.chats = {
      3: [note(1, "Prima nota"), note(2, "Seconda nota")],
      8: [note(5, "Nota di un altro cliente")],
    }
    const { rerender } = renderNotes(section("c-42"))
    await screen.findByText("Seconda nota")
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await user.click(trash("Seconda nota"))
    // The operator opens another customer while both are still running
    rerender(section("c-43"))
    await screen.findByText("Nota di un altro cliente")

    expect(status().textContent).toBe("")
    expect(notesWith("Richiamare domani")).toHaveLength(0)
  })

  describe("cambiando cliente durante l'eliminazione", () => {
    beforeEach(() => {
      backend.state.chats = {
        3: [note(1, "Prima nota"), note(2, "Seconda nota")],
        8: [note(5, "Nota di un altro cliente")],
      }
    })
    /** The section of `customerId`, once its notes are on screen */
    const show = async (
      rerender: (node: ReactNode) => void,
      customerId: string
    ) => {
      rerender(section(customerId))
      await screen.findByText(
        customerId === "c-42" ? "Prima nota" : "Nota di un altro cliente"
      )
    }

    it("tornando al cliente l'attesa c'è ancora e un secondo clic non parte", async () => {
      const { rerender, queryClient } = renderNotes(section("c-42"))
      await screen.findByText("Seconda nota")
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      await show(rerender, "c-43")
      await show(rerender, "c-42")

      expect(trash("Seconda nota").getAttribute("aria-busy")).toBe("true")
      await user.click(trash("Seconda nota"))
      await flush()
      expect(backend.state.deletes).toHaveLength(1)

      await answerDelete(queryClient, 0, "deleted")
      // The section reads the notes again, without it
      await waitFor(() => expect(screen.queryByText("Seconda nota")).toBeNull())
      expect(status().textContent).toBe("Nota eliminata")
    })

    it("se l'eliminazione fallisce sulla pagina di un altro cliente, niente errore lì; tornando il cestino è di nuovo attivo", async () => {
      const { rerender, queryClient } = renderNotes(section("c-42"))
      await screen.findByText("Seconda nota")
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      await show(rerender, "c-43")
      await answerDelete(queryClient, 0, "down")

      expect(screen.queryByText(deleteToast)).toBeNull()
      await show(rerender, "c-42")
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
    })

    it("se l'eliminazione fallisce dopo il ritorno al cliente, compare l'errore", async () => {
      const { rerender, queryClient } = renderNotes(section("c-42"))
      await screen.findByText("Seconda nota")
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      await show(rerender, "c-43")
      await show(rerender, "c-42")
      await answerDelete(queryClient, 0, "down")

      expect(await screen.findAllByText(deleteToast)).not.toHaveLength(0)
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
    })
  })

  it("se dopo il clic sul cestino l'operatore clicca altrove, il focus resta dove l'ha messo", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.click(document.body)
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(document.body)
  })

  it("se durante l'eliminazione l'operatore va altrove con la tastiera, il focus resta lì", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(trash("Prima nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("se il clic sul cestino non gli ha dato il focus (Safari), il focus non si sposta", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])

    // A click event alone: no pointer, no focus
    fireEvent.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(status().textContent).toBe("Nota eliminata")
    expect(document.activeElement).toBe(document.body)
  })

  it("un secondo clic sul cestino occupato non cambia dove va il focus", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.dblClick(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(3, "Terza nota")])

    expect(document.activeElement).toBe(trash("Terza nota"))
  })

  it("eliminata l'ultima nota, il focus va al cestino della precedente più vicina", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
      note(3, "Terza nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Terza nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota"), note(2, "Seconda nota")])

    expect(document.activeElement).toBe(trash("Seconda nota"))
  })

  it("con gli effetti doppi di StrictMode un'eliminazione parte e si annuncia una volta", async () => {
    const { reload, queryClient } = renderChat(
      [note(1, "Prima nota"), note(2, "Seconda nota")],
      2,
      5,
      { strict: true }
    )
    const user = userEvent.setup()
    const announced: string[] = []
    new MutationObserver(() =>
      announced.push(status().textContent ?? "")
    ).observe(status(), { childList: true, subtree: true, characterData: true })

    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota")])
    await act(async () => undefined)

    expect(backend.state.deletes).toHaveLength(1)
    expect(announced.filter((text) => text === "Nota eliminata")).toHaveLength(
      1
    )
    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it("eliminata l'ultima nota, il focus va al cestino della precedente", async () => {
    const { reload, queryClient } = renderChat([
      note(1, "Prima nota"),
      note(2, "Seconda nota"),
    ])
    const user = userEvent.setup()

    await user.click(trash("Seconda nota"))
    await answerDelete(queryClient, 0, "deleted")
    reload([note(1, "Prima nota")])

    expect(document.activeElement).toBe(trash("Prima nota"))
  })

  it.each([
    ["non risponde", "down"],
    ["rifiuta un operatore che non è l'autore", "forbidden"],
  ] as const)(
    "se il backend %s compare 'Nota non eliminata, riprova' e il cestino torna",
    async (_case, reply) => {
      const { queryClient } = renderChat([
        note(1, "Prima nota"),
        note(2, "Seconda nota"),
      ])
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      await answerDelete(queryClient, 0, reply)

      expect(await screen.findAllByText(deleteToast)).not.toHaveLength(0)
      expect(
        screen.getAllByText(deleteToast)[0]?.closest("[data-sonner-toast]")
      ).toHaveAttribute("data-type", "error")
      // Its own toast only: not the text of the error too
      expect(
        screen.queryByText("Solo l'autore della nota può eliminarla")
      ).toBeNull()
      expect(trash("Seconda nota").getAttribute("aria-busy")).not.toBe("true")
      expect(trash("Seconda nota").querySelector("svg.animate-spin")).toBeNull()
      expect(backend.state.touched).toEqual([])
      expect(status().textContent).toBe("")
    }
  )

  it(
    "'Nota non eliminata, riprova' dura 8 s (AC13)",
    { timeout: 20_000 },
    async () => {
      const { queryClient } = renderChat([
        note(1, "Prima nota"),
        note(2, "Seconda nota"),
      ])
      const user = userEvent.setup()

      await user.click(trash("Seconda nota"))
      await answerDelete(queryClient, 0, "down")

      await screen.findByText(deleteToast)
      await expectToastLasts(deleteToast, 8000)
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
  const newChat = () => (
    <CustomerNotes>
      <CustomerNewChat customerId="c-42" />
    </CustomerNotes>
  )

  it("crea la chat una volta sola, anche con un doppio clic", async () => {
    renderNotes(newChat())
    const user = userEvent.setup()

    await user.dblClick(start())
    await flush()

    expect(
      backend.state.chatStarts.map(({ customerId }) => customerId)
    ).toEqual(["c-42"])
  })

  it("durante la creazione la scheda resta e il pulsante è occupato, con lo spinner", async () => {
    renderNotes(newChat())
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

  it("quando il server risponde legge di nuovo il cliente e le note della chat", async () => {
    backend.state.customers = [customerOf({ id: "c-42", chatId: null })]
    const { queryClient } = renderNotes(newChat())
    const user = userEvent.setup()

    await user.click(start())
    await flush()
    expect(backend.state.chatReads).toEqual([])
    await answerStart(queryClient, 0, "started")

    await waitFor(() =>
      expect(start().getAttribute("aria-busy")).not.toBe("true")
    )
    const chatId = backend.state.customers[0]!.chatId!
    expect(backend.state.chatReads).toEqual([{ id: chatId, limit: 5 }])
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("il pulsante resta occupato finché le note della chat non sono lette", async () => {
    let arrive!: () => void
    backend.state.chatGate = new Promise<void>((resolve) => {
      arrive = resolve
    })
    const { queryClient } = renderNotes(newChat())
    const user = userEvent.setup()

    await user.click(start())
    await answerStart(queryClient, 0, "started")
    await waitFor(() => expect(backend.state.chatReads).toHaveLength(1))
    await flush()

    expect(start().getAttribute("aria-busy")).toBe("true")
    expect(start().querySelector("svg.animate-spin")).not.toBeNull()

    act(() => arrive())

    await waitFor(() =>
      expect(start().getAttribute("aria-busy")).not.toBe("true")
    )
  })

  it("se la creazione fallisce compare 'Chat non avviata, riprova' e il pulsante torna attivo", async () => {
    const { queryClient } = renderNotes(newChat())
    const user = userEvent.setup()

    await user.click(start())
    await answerStart(queryClient, 0, "down")

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Chat non avviata, riprova")
    expect(start().getAttribute("aria-describedby")).toBe(alert.id)
    expect(start().getAttribute("aria-busy")).not.toBe("true")
    expect(start().getAttribute("aria-disabled")).not.toBe("true")
    expect(backend.state.chatReads).toEqual([])
    // Its own message only, no toast
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()

    // Trying again clears the message
    await user.click(start())
    expect(screen.queryByRole("alert")).toBeNull()
    await waitFor(() => expect(backend.state.chatStarts).toHaveLength(2))
  })

  it("la chat appena avviata mette il focus nel campo della nota", async () => {
    const { reload, queryClient } = renderChat(null)
    const user = userEvent.setup()

    await user.click(start())
    await answerStart(queryClient, 0, "started")
    // The section draws the chat in place of the button
    reload([])

    expect(document.activeElement).toBe(field())
  })

  it("nella sezione del cliente la chat avviata prende il posto del pulsante, con il focus nel campo", async () => {
    backend.state.holdNotes = false
    backend.state.customers = [customerOf({ id: "c-42", chatId: null })]
    renderNotes(section("c-42"))
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole("button", { name: "Avvia una chat" })
    )

    await waitFor(() => expect(document.activeElement).toBe(field()))
    expect(screen.queryByRole("button", { name: "Avvia una chat" })).toBeNull()
    expect(screen.getByText("0 / 0")).toBeTruthy()
  })

  it("se l'operatore esce prima che la chat avviata compaia, riaprendo il cliente la chat non prende il focus", async () => {
    const { unmount, queryClient } = renderChat(null)
    const user = userEvent.setup()

    await user.click(start())
    await answerStart(queryClient, 0, "started")
    unmount()
    renderChat([])

    expect(document.activeElement).not.toBe(field())
  })

  it("una chat che c'era già non prende il focus", () => {
    renderChat([note(1, "Prima nota")])

    expect(document.activeElement).not.toBe(field())
  })

  it("se la creazione fallisce, la chat aperta dopo non prende il focus", async () => {
    const { unmount, queryClient } = renderNotes(newChat())
    const user = userEvent.setup()

    await user.click(start())
    await answerStart(queryClient, 0, "down")
    unmount()
    renderChat([])

    expect(document.activeElement).not.toBe(field())
  })
})

describe("CustomerChatSection, le note del cliente", () => {
  it("mostra le ultime note della chat, quante sono e 'Carica altri messaggi' che ne legge altre 5", async () => {
    backend.state.holdNotes = false
    backend.state.chats = {
      3: Array.from({ length: 7 }, (_, index) =>
        note(index + 1, `Nota ${index + 1}`)
      ),
    }
    renderNotes(section("c-42"))
    const user = userEvent.setup()

    expect(await screen.findByText("Nota 7")).toBeTruthy()
    expect(screen.queryByText("Nota 2")).toBeNull()
    expect(screen.getByText("5 / 7")).toBeTruthy()
    let arrive!: () => void
    backend.state.chatGate = new Promise<void>((resolve) => {
      arrive = resolve
    })

    await user.click(
      screen.getByRole("button", { name: "Carica altri messaggi" })
    )
    await waitFor(() => expect(backend.state.chatReads).toHaveLength(2))
    await flush()

    // While the longer list loads, the notes on screen stay
    expect(screen.getByText("Nota 7")).toBeTruthy()
    expect(screen.getByText("5 / 7")).toBeTruthy()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()

    act(() => arrive())

    // The section reads the longer list, which takes the place of the first
    expect(
      await screen.findByText("Nota 1", { ignore: "script, style, textarea" })
    ).toBeTruthy()
    expect(screen.getByText("7 / 7")).toBeTruthy()
    expect(backend.state.chatReads).toEqual([
      { id: 3, limit: 5 },
      { id: 3, limit: 10 },
    ])
  })

  it("una nota inviata nella sezione arriva salvata dalla nuova lettura delle note", async () => {
    backend.state.holdNotes = false
    backend.state.chats = { 3: [note(1, "Prima nota")] }
    renderNotes(section("c-42"))
    await screen.findByText("Prima nota")
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    await waitFor(() => expect(screen.getByText("2 / 2")).toBeTruthy())
    expect(notesWith("Richiamare domani")).toHaveLength(1)
    expect(status().textContent).toBe("Nota inviata")
    expect(backend.state.chatReads).toHaveLength(2)
  })

  it("se la chat non c'è più l'invio fallisce e la sezione mostra 'Avvia una chat'", async () => {
    backend.state.chats = { 3: [note(1, "Prima nota")] }
    const { queryClient } = renderNotes(section("c-42"))
    await screen.findByText("Prima nota")
    const user = userEvent.setup()
    // Its last note deleted in another tab
    backend.state.customers = [customerOf({ id: "c-42", chatId: null })]

    await user.type(field(), "Richiamare domani")
    await user.click(submit())
    await answerSend(queryClient, 0, "missing")

    expect(
      await screen.findByRole("button", { name: "Avvia una chat" })
    ).toBeTruthy()
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })
})

const alertText = "Nota non inviata, riprova"
const failure = () => screen.queryByRole("alert")

/** Sends `text`, and the backend answers the send with `reply` */
async function sendAndFail(
  user: ReturnType<typeof userEvent.setup>,
  queryClient: QueryClient,
  text: string,
  reply: SendAnswer = "down"
) {
  const index = backend.state.sends.length
  await user.type(field(), text)
  await user.click(submit())
  await answerSend(queryClient, index, reply)
}

describe("CustomerChat, nota non inviata (AC76)", () => {
  it.each([
    ["non risponde", "down"],
    ["non trova la chat", "missing"],
    ["non salva la nota", "none"],
  ] as const)(
    "se il backend %s, il testo torna nel campo con il messaggio e la nota non resta nella chat",
    async (_case, reply) => {
      const { queryClient } = renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()

      await sendAndFail(user, queryClient, "Richiamare domani", reply)

      expect(field().value).toBe("Richiamare domani")
      const alert = await screen.findByRole("alert")
      expect(alert.textContent).toBe(alertText)
      expect(field().getAttribute("aria-describedby")).toBe(alert.id)
      expect(notesWith("Richiamare domani")).toHaveLength(0)
      expect(backend.state.touched).toEqual([])
      expect(submit().getAttribute("aria-disabled")).not.toBe("true")
      // Its own message only, no toast
      expect(screen.queryByText("Chat non trovata")).toBeNull()
      expect(
        screen.queryByText("Il servizio non risponde, riprova tra poco")
      ).toBeNull()
    }
  )

  it("con l'operatore non ancora caricato non chiama il backend e il testo resta", async () => {
    operatorId = undefined
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Richiamare domani")
    await user.click(submit())

    expect(field().value).toBe("Richiamare domani")
    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(notesWith("Richiamare domani")).toHaveLength(0)
    await flush()
    expect(backend.state.sends).toEqual([])
    expect(backend.state.touched).toEqual([])
  })

  it("il messaggio sparisce all'inizio del secondo invio e ricompare se fallisce di nuovo", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")

    // Second send, still waiting for the answer
    await user.click(submit())
    expect(failure()).toBeNull()

    await answerSend(queryClient, 1, "none")
    expect(failure()?.textContent).toBe(alertText)
    expect(field().value).toBe("Richiamare")
  })

  it("il testo scritto durante l'invio resta, sotto quello non inviato", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Non inviata")
    await user.click(submit())
    await user.type(field(), "Scritta dopo")
    await answerSend(queryClient, 0, "down")

    expect(field().value).toBe("Non inviata\nScritta dopo")
  })

  it("dopo un fallimento, un invio riuscito toglie il messaggio e svuota il campo", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")

    await user.click(submit())
    await answerSend(queryClient, 1, { id: 903 })

    expect(failure()).toBeNull()
    expect(field().value).toBe("")
    expect(notesWith("Richiamare")).toHaveLength(1)
  })

  it("un invio riuscito non mostra il messaggio e lascia il campo vuoto", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Tutto bene")
    await user.click(submit())
    await answerSend(queryClient, 0, { id: 904 })

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
/** A draft left by an earlier chat, written by `author` (11 is the session's). */
const storeDraft = (
  customerId: string,
  text: string,
  author: number | null = OPERATOR
) =>
  window.sessionStorage.setItem(
    draftKey(customerId),
    JSON.stringify({ operatorId: author, text })
  )

describe("CustomerChat, bozza della nota non inviata (AC76, D18)", () => {
  const storageSpies: Array<{ mockRestore: () => void }> = []
  afterEach(() => {
    storageSpies.forEach((spy) => spy.mockRestore())
    storageSpies.length = 0
  })

  it("dopo un fallimento la bozza è salvata per il cliente", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare domani")
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
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    await user.click(submit())
    await answerSend(queryClient, 1, { id: 905 })

    expect(draftOf("c-42")).toBeNull()
  })

  it("svuotando il campo dopo un fallimento la bozza si cancella", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    await user.clear(field())

    expect(draftOf("c-42")).toBeNull()
    // New text after that was never sent: not a draft
    await user.type(field(), "Altro")
    expect(draftOf("c-42")).toBeNull()
  })

  it("cambiando il testo dopo un fallimento la bozza segue il campo", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    await user.type(field(), " alle 18")

    expect(draftOf("c-42")).toBe("Richiamare alle 18")
  })

  it("scrivendo durante il nuovo invio di una bozza, la bozza tiene anche il testo in volo", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    // Sent again, still waiting for the answer
    await user.click(submit())
    await user.type(field(), "Nuovo")

    expect(draftOf("c-42")).toBe("Richiamare\nNuovo")
  })

  it("se il fallimento arriva dopo che la chat si è chiusa, la bozza c'è e torna alla riapertura", async () => {
    const { unmount, queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Chiusa durante l'invio")
    await user.click(submit())
    await waitFor(() => expect(backend.state.sends).toHaveLength(1))
    // The customer sheet closes while the send is still running
    unmount()
    await answerSend(queryClient, 0, "down")

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
    await waitFor(() => expect(backend.state.sends).toHaveLength(1))
    // Closed and opened again while the send is still running
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await answerSend(first.queryClient, 0, "down")

    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(field().value).toBe("Testo fallito")
    await user.type(field(), " x")
    expect(draftOf("c-42")).toBe("Testo fallito x")
  })

  it("con l'operatore non ancora caricato il testo resta anche ricaricando", async () => {
    operatorId = undefined
    const { unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Senza operatore")
    await user.click(submit())
    expect(draftOf("c-42")).toBe("Senza operatore")

    unmount()
    clearChatMemory()
    operatorId = OPERATOR
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
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Mia")
    await screen.findByRole("alert")

    expect(storedDraft("c-42")?.operatorId).toBe(OPERATOR)
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
    await waitFor(() => expect(backend.state.sends).toHaveLength(1))
    first.unmount()
    const second = renderChat([note(1, "Prima nota")])
    await user.type(field(), "Y")
    await user.click(submit())
    // The closed chat's send answered first
    await answerSend(first.queryClient, 0, "down")
    expect(field().value).toBe("X")
    await answerSend(second.queryClient, 1, { id: 907 })

    expect(field().value).toBe("X")
    expect(draftOf("c-42")).toBe("X")
    await user.type(field(), "!")
    expect(draftOf("c-42")).toBe("X!")
  })

  it("dopo un ricaricamento la bozza aspetta l'operatore e poi torna nel campo", async () => {
    storeDraft("c-42", "Bozza")
    operatorId = undefined
    const { reload } = renderChat([note(1, "Prima nota")])

    await act(async () => undefined)
    expect(draftOf("c-42")).toBe("Bozza")
    expect(field().value).toBe("")

    operatorId = OPERATOR
    reload([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("Bozza")
  })

  it("con gli effetti doppi di StrictMode la bozza non si ripete", async () => {
    storeDraft("c-42", "Bozza")
    renderChat([note(1, "Prima nota")], 1, 5, { strict: true })

    await screen.findByRole("alert")
    expect(field().value).toBe("Bozza")
    expect(draftOf("c-42")).toBe("Bozza")
  })

  it("senza operatore il testo non si ripete quando l'operatore arriva", async () => {
    operatorId = undefined
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "T")
    await user.click(submit())
    operatorId = OPERATOR
    reload([note(1, "Prima nota")])
    await act(async () => undefined)

    expect(field().value).toBe("T")
    expect(storedDraft("c-42")).toEqual({ operatorId: OPERATOR, text: "T" })
  })

  it("inviando prima che l'operatore arrivi non si perde la bozza non ancora mostrata", async () => {
    storeDraft("c-42", "Originale")
    operatorId = undefined
    const { reload } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "abc")
    await user.click(submit())
    // Not checked yet: the stored draft stays as it is
    expect(draftOf("c-42")).toBe("Originale")
    operatorId = OPERATOR
    reload([note(1, "Prima nota")])
    await act(async () => undefined)

    expect(field().value).toBe("Originale\nabc")
    expect(draftOf("c-42")).toBe("Originale\nabc")
  })

  it("con la bozza di un collega, il testo inviato prima che l'operatore arrivi resta anche ricaricando", async () => {
    storeDraft("c-42", "Di un collega", 99)
    operatorId = undefined
    const { reload, unmount } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "abc")
    await user.click(submit())
    operatorId = OPERATOR
    reload([note(1, "Prima nota")])
    await act(async () => undefined)
    expect(field().value).toBe("abc")
    expect(storedDraft("c-42")).toEqual({ operatorId: OPERATOR, text: "abc" })

    unmount()
    clearChatMemory()
    renderChat([note(1, "Prima nota")])
    await screen.findByRole("alert")
    expect(field().value).toBe("abc")
  })

  it.each<[string, SendAnswer, string, string | null]>([
    ["fallisce", "down", "D\nZ", "D\nZ"],
    ["riesce", { id: 908 }, "Z", null],
  ])(
    "una bozza rinviata da una chat chiusa che %s non si ripete e non si perde",
    async (_case, reply, shown, draft) => {
      storeDraft("c-42", "D")
      const first = renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()
      await screen.findByRole("alert")

      await user.click(submit())
      await waitFor(() => expect(backend.state.sends).toHaveLength(1))
      first.unmount()
      renderChat([note(1, "Prima nota")])
      await user.type(field(), "Z")
      expect(draftOf("c-42")).toBe("D\nZ")
      await answerSend(first.queryClient, 0, reply)

      expect(field().value).toBe(shown)
      expect(draftOf("c-42")).toBe(draft)
      expect(failure() !== null).toBe(draft !== null)
    }
  )

  it("svuotando il campo il messaggio sparisce", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    await user.clear(field())

    expect(failure()).toBeNull()
  })

  it("una nota nuova in volo non entra nella bozza presa da un'altra chat", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "X")
    await user.click(submit())
    await waitFor(() => expect(backend.state.sends).toHaveLength(1))
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await user.type(field(), "Y")
    await user.click(submit())
    await answerSend(first.queryClient, 0, "down")
    await user.type(field(), "!")

    expect(draftOf("c-42")).toBe("X!")
  })

  it("il testo scritto nella chat aperta prima del fallimento della chat chiusa resta sotto", async () => {
    const first = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "X")
    await user.click(submit())
    await waitFor(() => expect(backend.state.sends).toHaveLength(1))
    first.unmount()
    renderChat([note(1, "Prima nota")])
    await user.type(field(), "Scritto qui")
    await answerSend(first.queryClient, 0, "down")

    expect(field().value).toBe("X\nScritto qui")
    expect(draftOf("c-42")).toBe("X\nScritto qui")
  })

  it("dopo un rinvio riuscito il testo nuovo non è una bozza", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare")
    await screen.findByRole("alert")
    await user.click(submit())
    await answerSend(queryClient, 1, { id: 909 })
    await user.type(field(), "Nuovo")

    expect(draftOf("c-42")).toBeNull()
    expect(failure()).toBeNull()
  })

  it("senza operatore la bozza segue il campo", async () => {
    operatorId = undefined
    renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Senza")
    await user.click(submit())
    await user.type(field(), " operatore")

    expect(draftOf("c-42")).toBe("Senza operatore")
  })

  it.each([
    ["senza operatore", undefined],
    ["con un invio che fallisce", OPERATOR],
  ])(
    "un campo vuoto inviato %s non mostra il messaggio e non fa una bozza",
    async (_case, operator) => {
      operatorId = operator
      const { queryClient } = renderChat([note(1, "Prima nota")])
      const user = userEvent.setup()

      await user.click(submit())
      // Only a loaded operator reaches the backend
      if (operator !== undefined) await answerSend(queryClient, 0, "down")
      await act(async () => undefined)
      expect(failure()).toBeNull()

      await user.type(field(), "mai inviato")
      expect(draftOf("c-42")).toBeNull()
    }
  )

  it("uscendo dal gestionale durante un invio, il fallimento non lascia niente al prossimo", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await user.type(field(), "Di Federica")
    await user.click(submit())
    act(() => clearUnsentNotes())
    await answerSend(queryClient, 0, "down")

    expect(draftOf("c-42")).toBeNull()
    expect(field().value).toBe("")
    expect(failure()).toBeNull()
  })

  it("uscendo dal gestionale la chat aperta si svuota", async () => {
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Da cancellare")
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
    const { queryClient } = renderChat([note(1, "Prima nota")])
    const user = userEvent.setup()

    await sendAndFail(user, queryClient, "Richiamare domani")

    expect((await screen.findByRole("alert")).textContent).toBe(alertText)
    expect(field().value).toBe("Richiamare domani")
    await user.clear(field())
    await user.type(field(), "Di nuovo")
    await user.click(submit())
    await answerSend(queryClient, 1, { id: 906 })
    expect(failure()).toBeNull()
  })
})
