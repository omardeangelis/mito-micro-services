import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { focusManager, onlineManager } from "@tanstack/react-query"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { renderWithApi } from "@/test/api"
import { fakeAdminHome, teamDay } from "@/test/adminHome"
import { myCallback } from "@/test/lavoro"
import { shownToasts, sleep } from "@/test/toast"
import { useInvalidateImports } from "../import"
import {
  adminHomeKeys,
  useAdminCallbacks,
  useLatestWaves,
  useMyCallbacks,
  useRefreshAdminHome,
  useRetryPart,
  useTeamDay,
  useTeamDetail,
} from "../home"

afterEach(() => {
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
})

// The reads of the home of the admin (spec home-admin, AC30, D6): the data of
// before stay on screen while the numbers of the moment arrive

function Numbers() {
  const day = useTeamDay()
  return <p>chiamate: {day.data?.calls ?? "nessun dato"}</p>
}

/** The page and another one, as a return to the home */
function Pages() {
  const [shown, setShown] = useState(true)
  return (
    <>
      <button onClick={() => setShown((value) => !value)}>Cambia pagina</button>
      {shown ? <Numbers /> : <p>altra pagina</p>}
    </>
  )
}

describe("i dati della home dell'admin", () => {
  it("una parte smontata e rimontata mostra subito i dati di prima mentre la seconda lettura è ferma", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 7 }) })
    renderWithApi(<Pages />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })
    await screen.findByText("chiamate: 7")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Cambia pagina" }))
    await screen.findByText("altra pagina")

    backend.state.day = teamDay({ calls: 9 })
    const release = backend.hold("getTeamDay")
    await user.click(screen.getByRole("button", { name: "Cambia pagina" }))

    expect(screen.getByText("chiamate: 7")).toBeVisible()
    await waitFor(() => expect(backend.state.reads.getTeamDay).toBe(2))
    act(() => release())
    await screen.findByText("chiamate: 9")
  })
})

/** The four reads of the home, as the page would hold them */
function FourParts() {
  useTeamDay()
  useLatestWaves()
  useTeamDetail()
  useAdminCallbacks()
  return null
}

describe("le regole di lettura della home dell'admin", () => {
  it("il focus della finestra non rilegge niente", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 7 }) })
    renderWithApi(<Numbers />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })
    await screen.findByText("chiamate: 7")

    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await sleep(100)

    expect(backend.state.reads.getTeamDay).toBe(1)
  })

  it("tornare in rete non rilegge niente", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 7 }) })
    renderWithApi(<Numbers />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })
    await screen.findByText("chiamate: 7")

    act(() => {
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
    })
    await sleep(100)

    expect(backend.state.reads.getTeamDay).toBe(1)
  })

  it("un errore non dà il toast dell'app", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getTeamDay")
    function Status() {
      const day = useTeamDay()
      return <p>stato: {day.status}</p>
    }
    renderWithApi(<Status />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })

    await screen.findByText("stato: error")
    await sleep(100)

    expect(shownToasts()).toHaveLength(0)
  })

  it("written() di useInvalidateImports rilegge le quattro parti", async () => {
    const backend = fakeAdminHome()
    function Parts() {
      const imports = useInvalidateImports()
      return (
        <>
          <FourParts />
          <button onClick={() => void imports.written()}>Importato</button>
        </>
      )
    }
    renderWithApi(<Parts />, { handlers: backend.handlers, auth: backend.auth })
    await waitFor(() => expect(backend.state.reads.getMyCallbacks).toBe(1))
    await waitFor(() => expect(backend.state.reads.getTeamDetail).toBe(1))

    await userEvent.setup().click(screen.getByRole("button"))

    await waitFor(() => {
      expect(backend.state.reads.getTeamDay).toBe(2)
      expect(backend.state.reads.getLatestWaves).toBe(2)
      expect(backend.state.reads.getTeamDetail).toBe(2)
      expect(backend.state.reads.getMyCallbacks).toBe(2)
    })
  })

  it("useMyCallbacks non vede la cache di useAdminCallbacks", async () => {
    const backend = fakeAdminHome({ callbacks: [myCallback()] })
    function Both() {
      const mine = useMyCallbacks()
      const admin = useAdminCallbacks()
      return (
        <p>
          mie: {mine.data?.rows.length ?? "-"} admin:{" "}
          {admin.data ? admin.data.today.length : "-"}
        </p>
      )
    }
    renderWithApi(<Both />, { handlers: backend.handlers, auth: backend.auth })

    await screen.findByText("mie: 1 admin: 1")

    expect(backend.state.reads.getMyCallbacks).toBe(2)
  })

  it("useRefreshAdminHome resta la stessa funzione fra due render", async () => {
    const backend = fakeAdminHome()
    const seen: Array<() => unknown> = []
    function Refresh() {
      const [count, setCount] = useState(0)
      const refresh = useRefreshAdminHome()
      seen.push(refresh)
      return <button onClick={() => setCount(count + 1)}>Render {count}</button>
    }
    renderWithApi(<Refresh />, {
      handlers: backend.handlers,
      auth: backend.auth,
    })

    await userEvent.setup().click(screen.getByRole("button"))
    await screen.findByText("Render 1")

    expect(seen.length).toBeGreaterThan(1)
    expect(new Set(seen).size).toBe(1)
  })

  it("dopo useRetryPart due osservatori della stessa lettura in errore sono insieme in pending", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 3 }) })
    backend.failWith("getTeamDay")
    function Observer({ name }: { name: string }) {
      const day = useTeamDay()
      return (
        <p>
          {name}: {day.status}/{day.errorUpdatedAt === 0 ? "pulito" : "errore"}
        </p>
      )
    }
    function Page() {
      const retry = useRetryPart()
      return (
        <>
          <Observer name="a" />
          <Observer name="b" />
          <button onClick={() => void retry(adminHomeKeys.day())}>
            Riprova
          </button>
        </>
      )
    }
    renderWithApi(<Page />, { handlers: backend.handlers, auth: backend.auth })
    await screen.findByText("a: error/errore")
    await screen.findByText("b: error/errore")

    backend.clearFailure("getTeamDay")
    const release = backend.hold("getTeamDay")
    await userEvent.setup().click(screen.getByRole("button"))

    await screen.findByText("a: pending/pulito")
    await screen.findByText("b: pending/pulito")
    act(() => release())
    await screen.findByText("a: success/pulito")
    await screen.findByText("b: success/pulito")
  })

  it("useAdminCallbacks divide gli scaduti da quelli di oggi", async () => {
    const backend = fakeAdminHome({
      callbacks: [
        myCallback({ alertId: 1, taskId: 1, daysLate: 0 }),
        myCallback({ alertId: 2, taskId: 2, daysLate: 3 }),
        myCallback({ alertId: 3, taskId: 3, daysLate: 1 }),
      ],
    })
    function Split() {
      const callbacks = useAdminCallbacks()
      return (
        <p>
          scaduti: {callbacks.data?.overdue.map((row) => row.taskId).join(",")}{" "}
          oggi: {callbacks.data?.today.map((row) => row.taskId).join(",")}
        </p>
      )
    }
    renderWithApi(<Split />, { handlers: backend.handlers, auth: backend.auth })

    await screen.findByText("scaduti: 2,3 oggi: 1")
  })
})
