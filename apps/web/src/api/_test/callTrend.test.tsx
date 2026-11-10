import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { renderWithApi } from "@/test/api"
import { fakeAdminHome, teamDay } from "@/test/adminHome"
import {
  adminHomeKeys,
  useCallTrend,
  useRefreshAdminHome,
  useRetryPart,
  useTeamDay,
} from "../home"

// The read of «Andamento delle chiamate» (spec andamenti-chiamate, AC12, D8)

function Trend() {
  const [period, setPeriod] = useState<"today" | "30d">("today")
  const trend = useCallTrend(period)
  return (
    <>
      <button onClick={() => setPeriod("30d")}>30 giorni</button>
      <p>
        {trend.data === undefined
          ? "caricamento"
          : `${trend.data.period}: ${trend.data.hours?.length ?? "nessuna"} ore, ${trend.data.days.length} giorni`}
      </p>
    </>
  )
}

describe("useCallTrend", () => {
  it("reads the hours of «Oggi», then another key for 30 days", async () => {
    const backend = fakeAdminHome()
    renderWithApi(<Trend />, { handlers: backend.handlers, auth: backend.auth })

    // 15:20 on the fake's clock: 8 hours
    expect(await screen.findByText(/^today: 8 ore/)).toBeInTheDocument()

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "30 giorni" }))
    expect(await screen.findByText(/^30d: nessuna ore/)).toBeInTheDocument()
    await waitFor(() =>
      expect(backend.state.callTrendReads).toEqual(["today", "30d"])
    )
  })

  it("«Riprova» rilegge solo la lettura dell'andamento, non le altre parti", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 3 }) })
    backend.failWith("getCallTrend")
    function Page() {
      const trend = useCallTrend("7d")
      const day = useTeamDay()
      const retry = useRetryPart()
      return (
        <>
          <p>trend: {trend.status}</p>
          <p>chiamate: {day.data?.calls ?? "nessun dato"}</p>
          <button onClick={() => void retry(adminHomeKeys.callTrend("7d"))}>
            Riprova
          </button>
        </>
      )
    }
    renderWithApi(<Page />, { handlers: backend.handlers, auth: backend.auth })
    await screen.findByText("trend: error")
    await screen.findByText("chiamate: 3")
    // The app retries a 5xx: count the reads of the failure, not a fixed number
    const trendBefore = backend.state.callTrendReads.length
    const daysBefore = backend.state.reads.getTeamDay

    backend.clearFailure("getCallTrend")
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Riprova" }))

    await screen.findByText("trend: success")
    expect(backend.state.callTrendReads.slice(trendBefore)).toEqual(["7d"])
    expect(backend.state.reads.getTeamDay).toBe(daysBefore)
  })

  it("useRefreshAdminHome rilegge anche l'andamento", async () => {
    const backend = fakeAdminHome()
    function Page() {
      const trend = useCallTrend("30d")
      const refresh = useRefreshAdminHome()
      return (
        <>
          <p>{trend.status}</p>
          <button onClick={() => void refresh()}>Importato</button>
        </>
      )
    }
    renderWithApi(<Page />, { handlers: backend.handlers, auth: backend.auth })
    await screen.findByText("success")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Importato" }))

    await waitFor(() =>
      expect(backend.state.callTrendReads).toEqual(["30d", "30d"])
    )
  })
})
