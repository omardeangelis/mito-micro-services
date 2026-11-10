import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { homeKeys } from "@/api/home"
import {
  fakeAdminHome,
  latestWave,
  latestWaves,
  teamDetail,
  teamMember,
} from "@/test/adminHome"
import { contactDetail } from "@/test/contacts"
import { renderHome } from "./page"

// The contact over the home (spec home-admin, AC29, D1, D10)

const team = teamDetail({
  members: [
    teamMember({
      operatorId: 7,
      name: "Ada Rossi",
      overdue: {
        total: 1,
        oldestDays: 3,
        rows: [
          {
            taskId: 101,
            name: "Mario Rossi",
            message: null,
            daysLate: 3,
            triedAt: null,
          },
        ],
      },
    }),
  ],
})

describe("Il contatto sopra la home (AC29)", () => {
  it("un clic su un cliente degli arretrati apre il foglio; con Esc la persona resta aperta, il fuoco è sul cliente e il team è riletto", async () => {
    const backend = fakeAdminHome({
      team,
      details: { 101: contactDetail({ contact: { id: 101 } }) },
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Ada Rossi" }))
    const customer = screen.getByRole("link", { name: "Mario Rossi" })
    expect(customer).toHaveAttribute("href", "/dashboard/contatti/101")

    await user.click(customer)

    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(window.location.search).toBe("?contatto=101")

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(window.location.search).toBe("")
    await waitFor(() => expect(backend.state.reads.getTeamDetail).toBe(2))
    expect(screen.getByRole("button", { name: "Ada Rossi" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Mario Rossi" })).toHaveFocus()
    )
  })
})

const details = { 101: contactDetail({ contact: { id: 101 } }) }

/** Opens the person and then the contact of the first overdue row */
const openContact = async (backend: ReturnType<typeof fakeAdminHome>) => {
  const user = userEvent.setup()
  await user.click(await screen.findByRole("button", { name: "Ada Rossi" }))
  await user.click(screen.getByRole("link", { name: "Mario Rossi" }))
  expect(await screen.findByRole("dialog")).toBeVisible()
  await waitFor(() => expect(backend.state.reads.getTeamDetail).toBe(1))
  return user
}

describe("Il contatto sopra la home, altri casi (AC29)", () => {
  it("una ricarica con ?contatto=101 apre il foglio e, sotto, la home", async () => {
    const backend = fakeAdminHome({ team, details })
    renderHome("/dashboard?contatto=101", backend, { role: "ADMIN" })

    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(
      await screen.findByRole("button", { name: "Ada Rossi", hidden: true })
    ).toBeInTheDocument()
    expect(window.location.search).toBe("?contatto=101")
  })

  it("con Ctrl il clic non apre il foglio: il collegamento resta una scheda nuova", async () => {
    const backend = fakeAdminHome({ team, details })
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Ada Rossi" }))

    fireEvent.click(screen.getByRole("link", { name: "Mario Rossi" }), {
      ctrlKey: true,
    })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(window.location.search).toBe("")
  })

  it("alla chiusura le quattro parti rileggono una volta", async () => {
    const backend = fakeAdminHome({ team, details })
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const user = await openContact(backend)
    const before = { ...backend.state.reads }

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(backend.state.reads).toEqual({
        getTeamDay: before.getTeamDay + 1,
        getLatestWaves: before.getLatestWaves + 1,
        getTeamDetail: before.getTeamDetail + 1,
        getMyCallbacks: before.getMyCallbacks + 1,
      })
    )
  })

  it("il dettaglio di una Wave aperto resta com'era dopo la chiusura", async () => {
    const backend = fakeAdminHome({
      team,
      details,
      waves: latestWaves({
        rows: [
          latestWave({ runId: 2, name: "NOV" }),
          latestWave({ runId: 1, name: "OTT" }),
        ],
      }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "OTT" }))
    await user.click(screen.getByRole("button", { name: "Ada Rossi" }))
    await user.click(screen.getByRole("link", { name: "Mario Rossi" }))
    expect(await screen.findByRole("dialog")).toBeVisible()

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
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

  it("`lavoro` non rilegge nulla di suo: nessuna sua lettura nella cache", async () => {
    const backend = fakeAdminHome({ team, details })
    const { queryClient } = renderHome("/dashboard", backend, {
      role: "ADMIN",
    })
    const user = await openContact(backend)

    await user.keyboard("{Escape}")

    await waitFor(() => expect(backend.state.reads.getTeamDetail).toBe(2))
    expect(
      queryClient.getQueryCache().findAll({ queryKey: homeKeys.all })
    ).toEqual([])
  })
})
