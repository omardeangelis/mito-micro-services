import { screen, waitFor } from "@testing-library/react"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { createBrowserRouter, RouterProvider } from "react-router"
import { describe, expect, it, onTestFinished } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { Unauthorized } from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type AnalysisQuery } from "@mito/contract/analytics"
import {
  analyticsKeys,
  useBranchTotals,
  useCallsByOperator,
  useContactProgressNow,
  useFinancedSeries,
  useMyCallSeries,
  useRoleChangeGuard,
  type AnalysisScope,
} from "@/api/analytics"
import { useCurrentUser } from "@/api/me"
import { fakeAnalisi } from "@/test/analisi"
import {
  ada,
  fakeMe,
  rejectingWith,
  renderWithApi,
  signedInAs,
} from "@/test/api"
import { shownToasts, sleep } from "@/test/toast"

const october: AnalysisQuery = {
  from: "2026-10-01",
  to: "2026-10-30",
  compare: "previous",
}

/** The financed series of the analysis page, or its state */
function Series() {
  const series = useFinancedSeries(october, {
    role: "ADMIN",
    operatorId: ada.id,
  })
  if (series.isPending) return <p>caricamento</p>
  if (series.isError) return <p>errore del grafico: {series.error._tag}</p>
  return <p>{series.data.days.length} giorni</p>
}

/** `ui` under a route with its own error element, as the pages are */
const inRoute = (ui: React.ReactNode) => {
  const router = createBrowserRouter([
    { path: "*", element: ui, errorElement: <p>errore della rotta</p> },
  ])
  onTestFinished(() => router.dispose())
  return <RouterProvider router={router} />
}

/** The group `analytics` with a financed series that dies: a 500 */
const failingSeries = HttpApiBuilder.group(MitoApi, "analytics", (handlers) =>
  handlers
    .handle("getFinancedTotal", () => Effect.die("unserved"))
    .handle("getFinancedAverage", () => Effect.die("unserved"))
    .handle("getFinancedByBranch", () => Effect.die("unserved"))
    .handle("getContactProgress", () => Effect.die("unserved"))
    .handle("getFinancedSeries", () => Effect.die("backend down"))
    .handle("getBranchTotals", () => Effect.die("unserved"))
    .handle("getCallsByOperator", () => Effect.die("unserved"))
    .handle("getMyCallSeries", () => Effect.die("unserved"))
)

/** The financed series of `query`, with the first day of its window */
function SeriesOf({ query }: { query: AnalysisQuery }) {
  const series = useFinancedSeries(query, { role: "ADMIN", operatorId: ada.id })
  if (series.isPending) return <p>caricamento</p>
  if (series.isError) return <p>errore del grafico: {series.error._tag}</p>
  return <p>finestra dal {series.data.window.from}</p>
}

describe("the queries of the analysis page (D10)", () => {
  it("a failed chart stays in its own state: no error of the route, no toast (AC20, AC21)", async () => {
    renderWithApi(inRoute(<Series />), {
      handlers: failingSeries,
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(await screen.findByText(/errore del grafico/)).toBeInTheDocument()
    expect(screen.queryByText("errore della rotta")).not.toBeInTheDocument()
    await sleep(250)
    expect(shownToasts()).toHaveLength(0)
  })

  it("two charts of different windows that fail with the expired session show one toast (AC23)", async () => {
    renderWithApi(
      inRoute(
        <>
          <Series />
          <SeriesOf query={{ ...october, from: "2026-10-10" }} />
        </>
      ),
      { handlers: failingSeries, auth: rejectingWith(new Unauthorized()) }
    )

    await waitFor(() =>
      expect(
        screen.getAllByText("errore del grafico: Unauthorized")
      ).toHaveLength(2)
    )
    await sleep(250)
    expect(shownToasts()).toHaveLength(1)
  })

  it("the session toast is armed again by any query that succeeds (AC23)", async () => {
    const backend = fakeAnalisi()
    const session = { expired: true }
    // Read at each call, in the generator: the middleware is applied once per endpoint
    const auth = Layer.succeed(Authenticated)((endpoint) =>
      Effect.gen(function* () {
        if (session.expired) return yield* new Unauthorized()
        return yield* Effect.provideService(endpoint, CurrentUser, {
          operator: ada,
          actor: { operatorId: ada.id, role: "ADMIN" },
        })
      })
    )
    const windowFrom = (from: string) => ({ ...october, from })
    const { rerender } = renderWithApi(
      <SeriesOf query={windowFrom("2026-10-02")} />,
      {
        handlers: backend.handlers,
        auth,
      }
    )
    expect(
      await screen.findByText("errore del grafico: Unauthorized")
    ).toBeVisible()
    await sleep(250)
    expect(shownToasts()).toHaveLength(1)

    // The user signs in again: a query succeeds
    session.expired = false
    rerender(<SeriesOf query={windowFrom("2026-10-03")} />)
    expect(await screen.findByText("finestra dal 2026-10-03")).toBeVisible()

    // The session expires again: the toast shows again
    session.expired = true
    rerender(<SeriesOf query={windowFrom("2026-10-04")} />)
    expect(
      await screen.findByText("errore del grafico: Unauthorized")
    ).toBeVisible()
    await sleep(250)
    expect(shownToasts()).toHaveLength(2)
  })
})

describe("the data of the analysis page", () => {
  it("never shows the window before under the label of the new one (AC26)", async () => {
    const backend = fakeAnalisi()
    const { rerender } = renderWithApi(<SeriesOf query={october} />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    expect(await screen.findByText("finestra dal 2026-10-01")).toBeVisible()

    const release = backend.hold("financed")
    rerender(<SeriesOf query={{ ...october, from: "2026-10-10" }} />)

    expect(await screen.findByText("caricamento")).toBeVisible()
    await waitFor(() => expect(backend.state.financedReads).toHaveLength(2))
    expect(screen.queryByText(/finestra dal/)).not.toBeInTheDocument()

    release()
    expect(await screen.findByText("finestra dal 2026-10-10")).toBeVisible()
  })

  it("echoes the window and its comparison, and records each read", async () => {
    const backend = fakeAnalisi()
    renderWithApi(<SeriesOf query={october} />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(await screen.findByText("finestra dal 2026-10-01")).toBeVisible()
    expect(backend.state.financedReads).toStrictEqual([october])
  })

  it("a 500 of a chart shows no toast, and the other charts stay usable (AC20, AC21)", async () => {
    const backend = fakeAnalisi()
    backend.state.failing.add("calls")
    function Charts() {
      const scope: AnalysisScope = { role: "ADMIN", operatorId: ada.id }
      const calls = useCallsByOperator(october, scope)
      const branches = useBranchTotals(october, scope)
      return (
        <>
          <p>chiamate: {calls.isError ? "errore" : "ok"}</p>
          <p>sedi: {branches.data?.rows.length ?? "caricamento"}</p>
        </>
      )
    }
    renderWithApi(inRoute(<Charts />), {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(await screen.findByText("chiamate: errore")).toBeVisible()
    expect(await screen.findByText("sedi: 9")).toBeVisible()
    expect(screen.queryByText("errore della rotta")).not.toBeInTheDocument()
    await sleep(250)
    expect(shownToasts()).toHaveLength(0)
  })

  it("an admin-only chart answered NotAdmin: the user is read again and the admin's queries are gone (AC23)", async () => {
    const analisi = fakeAnalisi()
    // The server still says ADMIN for the first read, the role changed after
    const me = fakeMe({ operator: ada, role: "ADMIN" })
    function Page() {
      const user = useCurrentUser()
      const scope: AnalysisScope | undefined = user.data && {
        role: user.data.role,
        operatorId: user.data.operatorId,
      }
      const branches = useBranchTotals(october, scope)
      useRoleChangeGuard([branches.error])
      if (scope === undefined) return <p>utente in caricamento</p>
      return <p>vista {scope.role}</p>
    }
    const { queryClient } = renderWithApi(<Page />, {
      handlers: Layer.mergeAll(analisi.handlers, me.handlers),
      auth: signedInAs(ada, "OPERATORE"),
    })

    expect(await screen.findByText("vista ADMIN")).toBeVisible()
    me.state.role = "OPERATORE"

    expect(await screen.findByText("vista OPERATORE")).toBeVisible()
    expect(me.state.reads).toBeGreaterThan(1)
    const adminQueries = queryClient
      .getQueryCache()
      .findAll({ queryKey: analyticsKeys.all })
      .filter(({ queryKey }) => JSON.stringify(queryKey).includes('"ADMIN"'))
    expect(adminQueries).toHaveLength(0)
    expect(analisi.state.branchReads).toHaveLength(0)
  })

  /** Every hook of the page for `scope`, with the financed series as sentinel */
  function Charts({ scope }: { scope: AnalysisScope }) {
    const financed = useFinancedSeries(october, scope)
    useBranchTotals(october, scope)
    useCallsByOperator(october, scope)
    useMyCallSeries(october, scope)
    useContactProgressNow(scope)
    return <p>{financed.isSuccess ? "finanziato" : "caricamento"}</p>
  }

  it("an operator never asks the admin-only endpoints", async () => {
    const backend = fakeAnalisi()
    renderWithApi(
      <Charts scope={{ role: "OPERATORE", operatorId: ada.id }} />,
      { handlers: backend.handlers, auth: signedInAs(ada, "OPERATORE") }
    )

    expect(await screen.findByText("finanziato")).toBeVisible()
    await waitFor(() => expect(backend.state.myCallsReads).toHaveLength(1))
    await waitFor(() => expect(backend.state.progressReads).toBe(1))
    expect(backend.state.branchReads).toHaveLength(0)
    expect(backend.state.callsReads).toHaveLength(0)
  })

  it("an admin never asks the own calls of an operator", async () => {
    const backend = fakeAnalisi()
    renderWithApi(<Charts scope={{ role: "ADMIN", operatorId: ada.id }} />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(await screen.findByText("finanziato")).toBeVisible()
    await waitFor(() => expect(backend.state.callsReads).toHaveLength(1))
    await waitFor(() => expect(backend.state.branchReads).toHaveLength(1))
    await waitFor(() => expect(backend.state.progressReads).toBe(1))
    expect(backend.state.myCallsReads).toHaveLength(0)
  })
})
