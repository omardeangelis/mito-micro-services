import * as Sentry from "@sentry/react"
import { screen, waitFor, within } from "@testing-library/react"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeLavoro, myCall, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

// The real breadcrumbs of the SDK, which `Sentry.init` of the app turns on: the
// target of `ui.click` comes from `htmlTreeAsString`, and Replay reads the same
// one. It is in `@sentry/browser-utils`, which the app doesn't depend on

const MESSAGE = "Dopo le 18 richiamare la signora"

const clicks: string[] = []

beforeAll(() => {
  Sentry.init({
    dsn: "https://key@o0.ingest.sentry.io/0",
    defaultIntegrations: false,
    integrations: [
      Sentry.breadcrumbsIntegration({
        dom: true,
        fetch: false,
        history: false,
        sentry: false,
        xhr: false,
      }),
    ],
    transport: () => ({
      send: () => Promise.resolve({}),
      flush: () => Promise.resolve(true),
    }),
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "ui.click")
        clicks.push(breadcrumb.message ?? "")
      return breadcrumb
    },
  })
})

afterAll(async () => {
  await Sentry.close()
})

beforeEach(() => {
  clicks.length = 0
})

const renderRow = async () => {
  const page = renderLavoro(
    "/dashboard",
    fakeLavoro({
      callbacks: [
        myCallback({
          alertId: 1,
          taskId: 101,
          name: "Anna",
          surname: "Bianchi",
          message: MESSAGE,
        }),
      ],
      calls: [myCall({ id: 1, message: MESSAGE })],
    })
  )
  await waitFor(() =>
    expect(document.querySelector("[data-callback-link]")).not.toBeNull()
  )
  return page
}

describe("i clic nei breadcrumb di Sentry non hanno i dati dei clienti", () => {
  it("sul messaggio di una riga di «Richiami da fare»", async () => {
    const { user } = await renderRow()
    const row = document.querySelector("[data-callback-link]")!.closest("tr")!

    // The line of the phone and the message, which has the `title`
    await user.click(within(row).getByText(MESSAGE).parentElement!)

    expect(clicks).toEqual([expect.stringMatching(/callback-message$/)])
    expect(clicks[0]).not.toContain("Dopo le 18")
  })

  it("sul messaggio di una riga di «Fatti oggi»", async () => {
    const { user } = await renderRow()
    const diary = screen.getByRole("region", { name: "Fatti oggi" })

    await user.click(await within(diary).findByText(MESSAGE))

    expect(clicks).toHaveLength(1)
    expect(clicks[0]).toContain("diary-message")
    expect(clicks[0]).not.toContain("Dopo le 18")
  })

  it("sul gruppo degli esiti, nominato con il cliente", async () => {
    const { user } = await renderRow()
    const group = screen.getByRole("group", {
      name: "Esito della chiamata a Anna Bianchi",
    })

    // Between two buttons: a button has too many classes to reach its parent
    await user.click(group)

    expect(clicks).toHaveLength(1)
    expect(clicks[0]).toContain("call-outcomes")
    expect(clicks[0]).not.toContain("Anna")
    expect(clicks[0]).not.toContain("Bianchi")
  })
})
