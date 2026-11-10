import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { adminHomeKeys } from "@/api/home"
import { fakeAdminHome, latestWave, latestWaves } from "@/test/adminHome"
import { renderHome } from "./page"

// The detail of an import (spec home-admin, AC11, AC12)

const person = (operatorId: number, name: string, toCall: number) => ({
  operatorId,
  userId: `user-${operatorId}`,
  name,
  inactiveDays: null as number | null,
  toCall,
  neverCalled: 0,
})

const twoWaves = latestWaves({
  rows: [
    latestWave({ runId: 2, name: "NOV", people: [person(7, "Ada Rossi", 3)] }),
    latestWave({ runId: 1, name: "OTT", people: [person(8, "Bruno Neri", 4)] }),
  ],
})

describe("Il dettaglio di un import (AC11)", () => {
  it("alla prima lettura è aperto quello del più recente; un clic sul nome di un'altra riga apre quello e chiude il primo", async () => {
    renderHome("/dashboard", fakeAdminHome({ waves: twoWaves }), {
      role: "ADMIN",
    })

    const latest = await screen.findByRole("button", { name: "NOV" })
    const older = screen.getByRole("button", { name: "OTT" })
    expect(latest).toHaveAttribute("aria-expanded", "true")
    expect(older).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Chi ha i contatti della NOV")).toBeVisible()

    await userEvent.setup().click(older)

    expect(older).toHaveAttribute("aria-expanded", "true")
    expect(latest).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Chi ha i contatti della OTT")).toBeVisible()
    expect(
      screen.queryByText("Chi ha i contatti della NOV")
    ).not.toBeInTheDocument()
  })
})

const OLD = latestWave({ runId: 1, name: "OLD" })
const NEW = latestWave({ runId: 2, name: "NEW" })

describe("Il più recente al ritorno e dopo una rilettura (AC11)", () => {
  it("tornando da un'altra pagina con una Wave nuova è aperta quella nuova, non la vecchia in cache", async () => {
    const backend = fakeAdminHome({ waves: latestWaves({ rows: [OLD] }) })
    const { router } = renderHome("/dashboard", backend, { role: "ADMIN" })
    expect(await screen.findByRole("button", { name: "OLD" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )

    await act(() => router.navigate("/dashboard/contatti"))
    expect(screen.getByText("altra pagina")).toBeVisible()
    backend.state.waves = latestWaves({ rows: [NEW, OLD] })
    await act(() => router.navigate("/dashboard"))

    expect(await screen.findByRole("button", { name: "NEW" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getByRole("button", { name: "OLD" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByText("Chi ha i contatti della NEW")).toBeVisible()
    expect(
      screen.queryByText("Chi ha i contatti della OLD")
    ).not.toBeInTheDocument()
  })

  it("dopo un clic dell'admin su una riga, una rilettura con una Wave nuova tiene quella riga", async () => {
    const backend = fakeAdminHome({
      waves: latestWaves({ rows: [NEW, OLD] }),
    })
    const { queryClient } = renderHome("/dashboard", backend, {
      role: "ADMIN",
    })
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "OLD" }))

    backend.state.waves = latestWaves({
      rows: [latestWave({ runId: 3, name: "DIC" }), NEW, OLD],
    })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: adminHomeKeys.waves() })
    )

    expect(await screen.findByRole("button", { name: "DIC" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByRole("button", { name: "OLD" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })
})

const personOf = (
  operatorId: number,
  name: string,
  overrides: Partial<ReturnType<typeof person>> = {}
) => ({ ...person(operatorId, name, 1), ...overrides })

/** The names of the rows of the open detail, in the order they are drawn */
const rowNames = (detail: HTMLElement) =>
  within(detail)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("[title]")?.getAttribute("title"))

const renderOne = (people: ReturnType<typeof person>[], name = "NOV") =>
  renderHome(
    "/dashboard",
    fakeAdminHome({
      waves: latestWaves({ rows: [latestWave({ runId: 2, name, people })] }),
    }),
    { role: "ADMIN" }
  )

describe("Il dettaglio di un import (AC12)", () => {
  it("prima gli inattivi, poi gli altri; in ogni gruppo prima chi ha più mai chiamati, poi per nome", async () => {
    renderOne([
      personOf(1, "Zeno", { neverCalled: 0 }),
      personOf(2, "Carla", { neverCalled: 5 }),
      personOf(3, "Anna", { neverCalled: 5 }),
      personOf(4, "Marta", { inactiveDays: 9, neverCalled: 1 }),
      personOf(5, "Luca", { inactiveDays: 3, neverCalled: 4 }),
    ])

    const title = await screen.findByText("Chi ha i contatti della NOV")
    expect(rowNames(title.closest("div")!.parentElement!)).toEqual([
      "Luca",
      "Marta",
      "Anna",
      "Carla",
      "Zeno",
    ])
  })

  it("«· <M> mai chiamati da chi è inattivo» solo con M > 0, e i singolari", async () => {
    renderOne([personOf(1, "Ada Rossi", { inactiveDays: 1, neverCalled: 1 })])

    expect(await screen.findByText("· 1 operatore")).toBeVisible()
    expect(screen.getByText(/· 1 mai chiamato da chi è inattivo/)).toBeVisible()
    expect(screen.getByText("inattivo da 1 giorno")).toBeVisible()
    expect(screen.getByText("1 mai chiamato")).toBeVisible()
    expect(screen.getByText("1 da chiamare")).toBeVisible()
  })

  it("senza mai chiamati di inattivi il titolo non ne parla; un inattivo senza mai chiamati non è ambra", async () => {
    renderOne([
      personOf(1, "Ada Rossi", { neverCalled: 4 }),
      personOf(2, "Bruno Neri", { inactiveDays: 12, neverCalled: 0 }),
    ])

    expect(await screen.findByText("· 2 operatori")).toBeVisible()
    expect(screen.queryByText(/da chi è inattivo/)).not.toBeInTheDocument()
    expect(screen.getByText("inattivo da 12 giorni")).toHaveClass(
      "text-warning-soft-foreground"
    )
    expect(screen.getByText("4 mai chiamati")).not.toHaveClass(
      "text-warning-soft-foreground"
    )
    expect(screen.getByText("0 mai chiamati")).not.toHaveClass(
      "text-warning-soft-foreground"
    )
  })

  it("i mai chiamati di un inattivo sono in ambra", async () => {
    renderOne([personOf(1, "Ada Rossi", { inactiveDays: 2, neverCalled: 3 })])

    expect(await screen.findByText("3 mai chiamati")).toHaveClass(
      "text-warning-soft-foreground"
    )
  })

  it("senza persone: «Nessuno ha ancora contatti di questa Wave.», senza «operatori»", async () => {
    renderOne([])

    expect(
      await screen.findByText("Nessuno ha ancora contatti di questa Wave.")
    ).toBeVisible()
    expect(screen.queryByText(/^· \d+ operator/)).not.toBeInTheDocument()
  })

  it("la barra è proporzionale al «da chiamare» più alto del dettaglio", async () => {
    renderOne([
      personOf(1, "Ada Rossi", { toCall: 40 }),
      personOf(2, "Bruno Neri", { toCall: 10 }),
    ])

    await screen.findByText("Chi ha i contatti della NOV")
    const widths = Array.from(
      document.querySelectorAll<HTMLElement>("[data-slot=wave-detail-bar]")
    ).map((bar) => bar.style.width)
    expect(widths).toEqual(["100%", "25%"])
  })
})

describe("Il dettaglio di un import, aperto e chiuso (AC11, AC31, D16)", () => {
  it("il pulsante dice se è aperto e cosa controlla; un clic sulla riga aperta la chiude", async () => {
    renderHome("/dashboard", fakeAdminHome({ waves: twoWaves }), {
      role: "ADMIN",
    })
    const latest = await screen.findByRole("button", { name: "NOV" })
    const controlled = latest.getAttribute("aria-controls")!
    expect(document.getElementById(controlled)).toContainElement(
      screen.getByText("Chi ha i contatti della NOV")
    )

    await userEvent.setup().click(latest)

    expect(latest).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByText("Chi ha i contatti della NOV")
    ).not.toBeInTheDocument()
  })

  it("la freccia ruota senza transizione (AC32)", async () => {
    renderHome("/dashboard", fakeAdminHome({ waves: twoWaves }), {
      role: "ADMIN",
    })
    const arrow = (
      await screen.findByRole("button", { name: "NOV" })
    ).querySelector("svg")!
    expect(arrow).toHaveClass("rotate-90")
    expect(arrow.getAttribute("class")).not.toMatch(/transition/)
  })

  it("una rilettura tiene aperto l'import scelto, non il più recente", async () => {
    const { queryClient } = renderHome(
      "/dashboard",
      fakeAdminHome({ waves: twoWaves }),
      { role: "ADMIN" }
    )
    const older = await screen.findByRole("button", { name: "OTT" })
    await userEvent.setup().click(older)

    await act(() =>
      queryClient.invalidateQueries({ queryKey: adminHomeKeys.waves() })
    )

    expect(screen.getByRole("button", { name: "OTT" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getByRole("button", { name: "NOV" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  it("l'import aperto sopravvive a un errore di rilettura e a «Riprova»", async () => {
    const backend = fakeAdminHome({ waves: twoWaves })
    const { queryClient } = renderHome("/dashboard", backend, {
      role: "ADMIN",
    })
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "OTT" }))

    backend.failWith("getLatestWaves")
    void queryClient.invalidateQueries({ queryKey: adminHomeKeys.waves() })
    await screen.findByText("Non è stato possibile caricare gli ultimi import.")
    backend.clearFailure("getLatestWaves")
    await userEvent
      .setup()
      .click(
        within(
          screen
            .getByText("Non è stato possibile caricare gli ultimi import.")
            .closest("[role=alert]")!
        ).getByRole("button", { name: "Riprova" })
      )

    expect(await screen.findByRole("button", { name: "OTT" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getByRole("button", { name: "NOV" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  it("se l'import aperto non è più fra i quattro, nessun dettaglio è aperto finché non ne apre uno", async () => {
    const backend = fakeAdminHome({ waves: twoWaves })
    const { queryClient } = renderHome("/dashboard", backend, {
      role: "ADMIN",
    })
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "OTT" }))

    backend.state.waves = latestWaves({
      rows: [
        latestWave({ runId: 3, name: "DIC" }),
        latestWave({ runId: 2, name: "NOV" }),
      ],
    })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: adminHomeKeys.waves() })
    )

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "DIC" })).toBeVisible()
    )
    for (const name of ["DIC", "NOV"])
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "false"
      )
    expect(screen.queryByText(/Chi ha i contatti/)).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole("button", { name: "NOV" }))
    expect(screen.getByText("Chi ha i contatti della NOV")).toBeVisible()
  })
})
