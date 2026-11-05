import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { onlineManager } from "@tanstack/react-query"
import { createBrowserRouter, RouterProvider, useNavigate } from "react-router"
import { afterEach, describe, expect, it, onTestFinished } from "vitest"
import { renderWithApi } from "@/test/api"
import { fakeLavoro, myCallback } from "@/test/lavoro"
import {
  homeKeys,
  useMyCallbacks,
  useMyCalls,
  useMyDay,
  useMyToCall,
  useRefreshHome,
} from "../home"
import { useRegisterCall } from "../task"

afterEach(() => onlineManager.setOnline(true))

/** The four parts of the home, and a button that registers a call on `taskId` */
function Parts({ taskId }: { taskId: number }) {
  useMyCallbacks()
  useMyCalls()
  useMyDay()
  useMyToCall()
  const register = useRegisterCall()
  return (
    <button
      onClick={() =>
        void register.mutateAsync({ taskId, outcome: "app.to", source: "list" })
      }
    >
      Registra
    </button>
  )
}

describe("i dati della home", () => {
  it("dopo un registerCall riuscito rilegge «Il mio oggi» e non le righe", async () => {
    const backend = fakeLavoro({
      callbacks: [myCallback({ alertId: 1, taskId: 101 })],
    })
    renderWithApi(<Parts taskId={101} />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })
    await waitFor(() => expect(backend.state.reads.getMyDay).toBe(1))

    await userEvent.setup().click(screen.getByRole("button"))

    await waitFor(() => expect(backend.state.reads.getMyDay).toBe(2))
    expect(backend.state.reads.getMyCalls).toBe(2)
    expect(backend.state.reads.getMyToCall).toBe(2)
    expect(backend.state.reads.getMyCallbacks).toBe(1)
  })
})

/** What each part of the home shows: its status, and what it holds */
function Status() {
  const callbacks = useMyCallbacks()
  const calls = useMyCalls()
  const day = useMyDay()
  const toCall = useMyToCall()
  const { refreshRows } = useRefreshHome()
  const register = useRegisterCall()
  return (
    <div>
      <p>
        callbacks: {callbacks.status}/{callbacks.fetchStatus}/
        {callbacks.data?.readTick ?? "-"}
      </p>
      <p>
        calls: {calls.status}/{calls.fetchStatus}/{calls.data?.length ?? "-"}
      </p>
      <p>
        day: {day.status}/{day.fetchStatus}/{day.data?.calls ?? "-"}
      </p>
      <p>
        toCall: {toCall.status}/{toCall.fetchStatus}/{toCall.data?.total ?? "-"}
      </p>
      <button onClick={() => void refreshRows()}>Rileggi</button>
      <button
        onClick={() =>
          void register
            .mutateAsync({ taskId: 101, outcome: "app.to", source: "list" })
            .then((result) =>
              result.kind === "uncertain"
                ? `uncertain:${result.requestId}`
                : result.kind
            )
            .then((text) => (document.title = text))
        }
      >
        Registra
      </button>
    </div>
  )
}

const setup = (
  before: (backend: ReturnType<typeof fakeLavoro>) => void = () => undefined
) => {
  const backend = fakeLavoro({
    callbacks: [myCallback({ alertId: 1, taskId: 101 })],
  })
  before(backend)
  const view = renderWithApi(<Status />, {
    handlers: backend.handlers,
    auth: backend.auth,
  })
  return { ...view, backend, user: userEvent.setup() }
}

describe("le quattro parti della home", () => {
  it("un errore di lettura resta nella parte, senza avvisi dell'app (AC37)", async () => {
    setup((backend) => backend.failWith("getMyDay", "unavailable"))

    await screen.findByText(/^day: error/)

    await screen.findByText(/^callbacks: success/)
    await screen.findByText(/^toCall: success/)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText(/Il servizio non risponde/)).toBeNull()
  })

  it("dopo lo smontaggio la cache delle quattro parti è vuota", async () => {
    const { queryClient, unmount } = setup()
    await screen.findByText(/^toCall: success/)
    await screen.findByText(/^callbacks: success/)

    unmount()

    await waitFor(() =>
      expect(
        queryClient.getQueryCache().findAll({ queryKey: homeKeys.all })
      ).toHaveLength(0)
    )
  })

  it("offline una lettura che non risponde fallisce e non resta in pausa", async () => {
    setup((backend) => {
      backend.failWith("getMyDay", "unavailable")
      onlineManager.setOnline(false)
    })

    await screen.findByText("day: error/idle/-")
  })

  it("readTick cresce a ogni lettura delle righe", async () => {
    const { user } = setup()
    const tickOf = () =>
      Number(/\/(\d+)$/.exec(screen.getByText(/^callbacks:/).textContent)?.[1])
    await screen.findByText(/^callbacks: success\/idle\/\d+/)
    const first = tickOf()

    await user.click(screen.getByRole("button", { name: "Rileggi" }))

    await waitFor(() => expect(tickOf()).toBeGreaterThan(first))
  })

  it("un registerCall che finisce durante il primo caricamento del diario fa partire una lettura nuova (AC35)", async () => {
    // Each read photographs the diary as it arrives; none leaves yet
    let release: () => void = () => undefined
    const { backend, user } = setup((backend) => {
      release = backend.hold("getMyCalls", { snapshot: true })
    })
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))

    await user.click(screen.getByRole("button", { name: "Registra" }))
    await waitFor(() => expect(document.title).toBe("registered"))
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(2))
    release()

    await screen.findByText("calls: success/idle/1")
    await screen.findByText("day: success/idle/1")
  })

  it("uncertain porta il requestId spedito", async () => {
    const { backend, user } = setup((backend) =>
      backend.failWith("registerCall", "unavailable")
    )
    await screen.findByText(/^callbacks: success/)

    await user.click(screen.getByRole("button", { name: "Registra" }))

    await waitFor(() => expect(document.title).toMatch(/^uncertain:/))
    expect(document.title).toBe(`uncertain:${backend.state.sent[0]!.requestId}`)
  })
})

describe("il navigate di una pagina smontata", () => {
  it("porta ancora alla rotta (AC52)", async () => {
    let saved: ReturnType<typeof useNavigate> | undefined
    const Page = () => {
      saved = useNavigate()
      return <p>pagina A</p>
    }
    const router = createBrowserRouter([
      { path: "/", element: <Page /> },
      { path: "/b", element: <p>pagina B</p> },
      { path: "/c", element: <p>pagina C</p> },
    ])
    onTestFinished(() => router.dispose())
    const backend = fakeLavoro()
    renderWithApi(<RouterProvider router={router} />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })
    await screen.findByText("pagina A")

    await act(() => router.navigate("/b"))
    await screen.findByText("pagina B")
    expect(screen.queryByText("pagina A")).toBeNull()
    await act(() => saved!("/c"))

    await screen.findByText("pagina C")
    expect(window.location.pathname).toBe("/c")
  })
})
