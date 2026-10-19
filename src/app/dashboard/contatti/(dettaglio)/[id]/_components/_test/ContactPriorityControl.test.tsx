import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import { detailHrefFromDa } from "../../../../_lib/detailHrefFromDa"
import { ContactPriorityControl } from "../ContactPriorityControl"
import { lastToastActionHref } from "./toastActionHref"

type Call = {
  vars: Record<string, unknown>
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  // What the router refresh does to the page: set by the harness
  onRefresh: () => undefined as void,
  toast: vi.fn(),
  announceAlert: vi.fn(),
}))

vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        setPriority: {
          useMutation: () =>
            useMutation({
              mutationFn: (vars: Record<string, unknown>) =>
                new Promise<void>((resolve, reject) => {
                  mocks.calls.push({ vars, resolve, reject })
                }),
            }),
        },
      },
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => mocks.onRefresh(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock("../../../_components/ContactSheet", () => ({
  useContactSheet: () => ({
    announce: vi.fn(),
    announceAlert: mocks.announceAlert,
    focusStateTriggerOnNextMount: vi.fn(),
    consumeStateTriggerFocus: () => false,
    focusTitle: vi.fn(),
  }),
}))

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        path: "task.setPriority",
        zodError: null,
        contactError,
      },
    },
  })

const DA = "stato=richiamare&pagina=2"

type Saved = { priority: number | null; customPriority: boolean | null }

/** The page: after the refresh the control gets the new saved value. */
function Page({
  initial,
  afterRefresh,
}: {
  initial: Saved
  afterRefresh: Saved
}) {
  const [saved, setSaved] = useState(initial)
  mocks.onRefresh = () => setSaved(afterRefresh)
  return (
    <ContactPriorityControl
      taskId={101}
      priority={saved.priority}
      customPriority={saved.customPriority}
      da={DA}
    />
  )
}

const setup = (initial: Saved, afterRefresh: Saved = initial) => {
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <Page initial={initial} afterRefresh={afterRefresh} />
    </QueryClientProvider>
  )
  return user
}

const trigger = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /, cambia priorità$/ })

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(trigger())
}

beforeEach(() => {
  mocks.calls.length = 0
  mocks.toast.mockClear()
  mocks.announceAlert.mockClear()
})

describe("la priorità nel dettaglio: cosa mostra (AC42, AC43)", () => {
  it.each([
    [{ priority: 70, customPriority: true }, "Manuale"],
    [{ priority: 120, customPriority: false }, "Automatica"],
    [{ priority: null, customPriority: null }, "Automatica"],
  ])("con %o dice '%s' e lo mette nel nome del pulsante", (saved, label) => {
    setup(saved)

    expect(trigger().textContent).toContain(label)
    expect(trigger().getAttribute("aria-label")).toBe(
      `${label}, cambia priorità`
    )
  })

  it("offre le quattro fasce e 'Automatica', con la scelta attuale segnata", async () => {
    const user = setup({ priority: 70, customPriority: true })

    await open(user)

    const options = screen.getAllByRole("menuitemradio")
    expect(options.map((option) => option.textContent)).toEqual([
      "Bassa",
      "Media",
      "Alta",
      "Urgente",
      "Automatica",
    ])
    expect(
      options.map((option) => option.getAttribute("aria-checked"))
    ).toEqual(["false", "false", "true", "false", "false"])
  })

  it("con la priorità automatica è segnata 'Automatica'", async () => {
    const user = setup({ priority: 120, customPriority: false })

    await open(user)

    expect(
      screen
        .getByRole("menuitemradio", { name: "Automatica" })
        .getAttribute("aria-checked")
    ).toBe("true")
  })
})

describe("scegliere la priorità (AC42, AC43)", () => {
  it("una fascia salva quella fascia e il pulsante mostra il valore salvato finché non arriva il nuovo", async () => {
    const user = setup(
      { priority: 120, customPriority: false },
      { priority: 100, customPriority: true }
    )
    await open(user)

    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]!.vars).toEqual({ taskId: 101, priority: "high" })
    // Not before the save: the saved value is still on screen, and waiting
    expect(trigger().getAttribute("aria-label")).toBe(
      "Automatica, cambia priorità"
    )
    expect(trigger().getAttribute("aria-disabled")).toBe("true")

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Manuale, cambia priorità"
      )
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
  })

  it("'Automatica' rimanda la priorità al cron: 'auto', e l'etichetta cambia dopo il salvataggio e non prima", async () => {
    const user = setup(
      { priority: 100, customPriority: true },
      { priority: 100, customPriority: false }
    )
    await open(user)

    await user.click(screen.getByRole("menuitemradio", { name: "Automatica" }))

    expect(mocks.calls[0]!.vars).toEqual({ taskId: 101, priority: "auto" })
    expect(trigger().getAttribute("aria-label")).toBe(
      "Manuale, cambia priorità"
    )

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Automatica, cambia priorità"
      )
    )
  })

  it("riscegliere la scelta attuale non chiama il server", async () => {
    const user = setup({ priority: 100, customPriority: true })
    await open(user)

    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    expect(mocks.calls).toHaveLength(0)
  })

  it("non si invia due volte durante il salvataggio", async () => {
    const user = setup({ priority: 120, customPriority: false })
    await open(user)
    await user.click(screen.getByRole("menuitemradio", { name: "Alta" }))

    await user.click(trigger())

    expect(screen.queryByRole("menuitemradio")).toBeNull()
    expect(mocks.calls).toHaveLength(1)
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("toast con il motivo, lo stesso testo dentro la Sheet, e il valore salvato resta", async () => {
    const user = setup({ priority: 120, customPriority: false })
    await open(user)
    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))
    const error = rejection({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Giulia Bianchi" },
    })

    await act(async () => {
      mocks.calls[0]!.reject(error)
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: describeContactError(error),
      })
    )
    expect(mocks.announceAlert).toHaveBeenCalledWith(
      describeContactError(error)
    )
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger().getAttribute("aria-label")).toBe(
      "Automatica, cambia priorità"
    )
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const user = setup({ priority: 120, customPriority: false })
    await open(user)
    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))

    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({
          code: "CONTACT_SUPERSEDED",
          payload: { activeTaskId: 303 },
        })
      )
    })

    expect(lastToastActionHref(mocks.toast)).toBe(detailHrefFromDa(303, DA))
  })
})
