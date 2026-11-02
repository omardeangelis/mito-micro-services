import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { onlineManager } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CallAlreadyWorked } from "@mito/contract/errors"
import { type TaskStatus } from "@mito/contract/task"
import { describeApiError } from "@/api/errors"
import {
  REGISTER_CALL_TIMEOUT_MS,
  useContactDetail,
  useRegisterCall,
  useRemoveCallback,
} from "@/api/task"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { contactDetail, contactRow, fakeContacts } from "@/test/contacts"

// «Registra chiamata» and «Togli il richiamo» of the data layer, on a backend
// in memory: what the page reads from `data.kind` (AC11, AC15, AC33)

/** A page with two presses and what the mutation answered */
function Presses() {
  const register = useRegisterCall()
  const detail = useContactDetail("101", { enabled: true })
  return (
    <div>
      <button
        onClick={() =>
          register.mutate({
            taskId: 101,
            outcome: "app.to",
            source: "detail",
          })
        }
      >
        Appuntamento
      </button>
      <p>pending: {String(register.isPending)}</p>
      <p>error: {String(register.isError)}</p>
      <p>kind: {register.data?.kind ?? "none"}</p>
      <p>
        rejected:{" "}
        {register.data?.kind === "rejected"
          ? describeApiError(register.data.error)
          : "none"}
      </p>
      <p>state: {detail.data?.contact.state ?? "loading"}</p>
      <p>calls: {detail.data?.calls.length ?? "loading"}</p>
    </div>
  )
}

const setup = () => {
  const backend = fakeContacts({
    rows: [contactRow()],
    details: { 101: contactDetail() },
  })
  const view = renderWithApi(<Presses />, {
    handlers: backend.handlers,
    auth: signedInAs(ada),
  })
  return { ...view, backend, user: userEvent.setup() }
}

afterEach(() => {
  vi.useRealTimers()
  onlineManager.setOnline(true)
})

describe("useRegisterCall", () => {
  it("offline manda lo stesso e dà subito l'esito, senza rimandarlo quando la rete torna (AC15, D5)", async () => {
    const { backend, user } = setup()
    backend.state.callAnswer = () => "down"
    await screen.findByText("state: chiamare")
    act(() => onlineManager.setOnline(false))

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))

    await screen.findByText("kind: uncertain")
    expect(screen.getByText("pending: false")).toBeTruthy()
    act(() => onlineManager.setOnline(true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(backend.state.calls).toHaveLength(1)
  })

  it("un ApiUnavailable dà l'esito incerto, con un solo invio arrivato all'handler (AC15)", async () => {
    const { backend, user } = setup()
    backend.state.callAnswer = () => "down"
    await screen.findByText("state: chiamare")

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))

    await screen.findByText("kind: uncertain")
    expect(backend.state.calls).toHaveLength(1)
    // No second attempt, even after the retry delays of the app
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(backend.state.calls).toHaveLength(1)
  })

  it("nessun altro testo d'errore a schermo: né toast né errore della mutation (AC15)", async () => {
    const { backend, user } = setup()
    backend.state.callAnswer = () => "down"
    await screen.findByText("state: chiamare")

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))

    await screen.findByText("kind: uncertain")
    expect(screen.getByText("error: false")).toBeTruthy()
    expect(screen.queryByText(/Il servizio non risponde/)).toBeNull()
    expect(screen.queryByText(/Modifica non salvata/)).toBeNull()
  })

  it("due pressioni mandano due requestId diversi (AC11)", async () => {
    const { backend, user } = setup()
    await screen.findByText("state: chiamare")
    const button = screen.getByRole("button", { name: "Appuntamento" })

    await user.click(button)
    await screen.findByText("kind: registered")
    await user.click(button)
    await waitFor(() => expect(backend.state.calls).toHaveLength(2))

    const [first, second] = backend.state.calls.map(
      ({ requestId }) => requestId
    )
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toMatch(/^[0-9a-f-]{36}$/)
    expect(first).not.toBe(second)
  })

  it("una registrazione riuscita rilegge il dettaglio senza ricaricare (AC16)", async () => {
    const { user } = setup()
    await screen.findByText("state: chiamare")

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))

    await screen.findByText("kind: registered")
    await screen.findByText("state: app.to")
  })

  it("un rifiuto arriva come dato, con le etichette, senza toast (AC15)", async () => {
    const { backend, user } = setup()
    backend.state.callAnswer = () => ({
      rejected: new CallAlreadyWorked({
        by: "Grace Hopper",
        at: new Date("2026-10-15T07:05:00Z"),
      }),
    })
    await screen.findByText("state: chiamare")

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))

    await screen.findByText("kind: rejected")
    expect(
      screen.getByText("rejected: Già lavorato da Grace Hopper alle 09:05")
    ).toBeTruthy()
    expect(screen.getByText("error: false")).toBeTruthy()
    expect(screen.queryByText(/Il servizio non risponde/)).toBeNull()
  })

  it("senza risposta, dopo 15 secondi l'esito è incerto, e il pulsante è libero (AC15, AC33)", async () => {
    const { backend, user: _user } = setup()
    await screen.findByText("state: chiamare")
    backend.state.writeGate = new Promise<void>(() => undefined)
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    })
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    })

    await user.click(screen.getByRole("button", { name: "Appuntamento" }))
    await screen.findByText("pending: true")
    await act(() =>
      vi.advanceTimersByTimeAsync(REGISTER_CALL_TIMEOUT_MS - 1000)
    )
    expect(screen.getByText("pending: true")).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(1000))

    await screen.findByText("kind: uncertain")
    expect(screen.getByText("pending: false")).toBeTruthy()
    expect(screen.queryByText(/Il servizio non risponde/)).toBeNull()
  })
})

/** The state the user chose in «Togli il richiamo» */
function Removal({ state }: { state: TaskStatus }) {
  const remove = useRemoveCallback()
  return (
    <div>
      <button onClick={() => remove.mutate({ alertId: 5, taskId: 101, state })}>
        Togli
      </button>
      <p>
        data:{" "}
        {remove.data ? `${remove.data.taskId}:${remove.data.state}` : "none"}
      </p>
    </div>
  )
}

describe("useRemoveCallback", () => {
  it("offline manda lo stesso, senza fermarsi ad aspettare la rete", async () => {
    const backend = fakeContacts()
    renderWithApi(<Removal state="non interessato" />, {
      handlers: backend.handlers,
      auth: signedInAs(ada),
    })
    act(() => onlineManager.setOnline(false))

    await userEvent.setup().click(screen.getByRole("button", { name: "Togli" }))

    await screen.findByText("data: 101:non interessato")
    expect(backend.state.removals).toHaveLength(1)
  })

  it("manda l'alert, il contatto e lo stato scelto", async () => {
    const backend = fakeContacts()
    renderWithApi(<Removal state="non interessato" />, {
      handlers: backend.handlers,
      auth: signedInAs(ada),
    })

    await userEvent.setup().click(screen.getByRole("button", { name: "Togli" }))

    await screen.findByText("data: 101:non interessato")
    expect(backend.state.removals).toEqual([
      { alertId: 5, taskId: 101, state: "non interessato" },
    ])
  })
})
