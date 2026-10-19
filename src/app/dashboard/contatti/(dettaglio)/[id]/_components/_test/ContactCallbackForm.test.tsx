import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import { formatDeadline } from "@/lib/utils/format"
import { ContactCallbackForm } from "../ContactCallbackForm"

type Call = {
  vars: Record<string, unknown>
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  refresh: vi.fn(),
  toast: vi.fn(),
  announceAlert: vi.fn(),
}))

// Real `useMutation`, with a promise the test settles by hand
vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        setCallback: {
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
    refresh: mocks.refresh,
    replace: vi.fn(),
    push: vi.fn(),
  }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

// The shell is tested on its own: here it is the API the form calls
vi.mock("../../../_components/ContactSheet", () => ({
  useContactSheet: () => ({
    announce: vi.fn(),
    announceAlert: mocks.announceAlert,
    focusStateTriggerOnNextMount: vi.fn(),
    consumeStateTriggerFocus: () => false,
    focusTitle: vi.fn(),
  }),
}))

// 12:00 of 15/10/2026 in Rome. Only the clock is faked: timers stay real
const NOW = new Date("2026-10-15T10:00:00Z")

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "BAD_REQUEST",
        httpStatus: 400,
        path: "task.setCallback",
        zodError: null,
        contactError,
      },
    },
  })

type Props = React.ComponentProps<typeof ContactCallbackForm>

const openAlert = {
  id: 5,
  deadline: new Date("2026-10-20T22:00:00Z"),
  message: "Richiamare dopo le 15",
}

const setup = (props: Partial<Props> = {}) => {
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <ContactCallbackForm
        taskId={101}
        state="app.to"
        alert={null}
        {...props}
      />
    </QueryClientProvider>
  )
  return user
}

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Imposta richiamo" }))
}

/** The in-month day buttons of the calendar named `day`. */
const dayButton = (day: number) =>
  screen
    .getAllByRole("gridcell", { name: String(day) })
    .find((cell) => !cell.className.includes("day-outside"))!

const pickDay = async (
  user: ReturnType<typeof userEvent.setup>,
  day: number
) => {
  await user.click(screen.getByRole("button", { name: /Imposta scadenza/ }))
  await user.click(dayButton(day))
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Salva richiamo" }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  mocks.calls.length = 0
  mocks.refresh.mockClear()
  mocks.toast.mockClear()
  mocks.announceAlert.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("'Imposta richiamo' è disponibile solo con un esito o nessuno (AC46)", () => {
  it.each([
    "app.to",
    "caricato",
    "erogata",
    "non interessato",
    "richiamare",
    "nessuno",
    null,
  ] as const)("con lo stato %s", (state) => {
    setup({ state })

    expect(
      screen.getByRole("button", { name: "Imposta richiamo" })
    ).toBeTruthy()
  })

  it.each(["chiamare", "followup"] as const)(
    "con lo stato %s non c'è",
    (state) => {
      setup({ state })

      expect(
        screen.queryByRole("button", { name: "Imposta richiamo" })
      ).toBeNull()
    }
  )
})

describe("il modulo (AC44)", () => {
  it("dice quale richiamo sostituisce, in un nodo che si annuncia", async () => {
    const user = setup({ alert: openAlert })

    await openForm(user)

    const note = screen.getByRole("status")
    expect(note.textContent).toContain(
      `Sostituisce il richiamo del ${formatDeadline(openAlert.deadline)}`
    )
    expect(note.textContent).toContain("Richiamare dopo le 15")
  })

  it("senza un alert aperto non sostituisce niente", async () => {
    const user = setup({ alert: null })

    await openForm(user)

    expect(screen.queryByText(/Sostituisce il richiamo/)).toBeNull()
  })

  it("non offre oggi né i giorni passati, secondo l'ora italiana, ma da domani sì (D22)", async () => {
    const user = setup()
    await openForm(user)
    await user.click(screen.getByRole("button", { name: /Imposta scadenza/ }))

    expect((dayButton(14) as HTMLButtonElement).disabled).toBe(true)
    expect((dayButton(15) as HTMLButtonElement).disabled).toBe(true)
    expect((dayButton(16) as HTMLButtonElement).disabled).toBe(false)
  })

  it("non si salva senza una data", async () => {
    const user = setup()
    await openForm(user)

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Salva richiamo",
      }).disabled
    ).toBe(true)
  })
})

describe("il salvataggio (AC44, AC45)", () => {
  it("manda il giorno, il messaggio e l'alert sostituito, e non si invia due volte", async () => {
    const user = setup({ alert: openAlert })
    await openForm(user)
    await pickDay(user, 20)
    await user.type(
      screen.getByPlaceholderText("Messaggio"),
      "  Richiamare alle 15  "
    )

    await save(user)
    await save(user)

    expect(mocks.calls).toHaveLength(1)
    const vars = mocks.calls[0]!.vars as {
      taskId: number
      deadline: Date
      message: string | null
      replacesAlertId: number | null
    }
    expect(vars.taskId).toBe(101)
    expect(vars.message).toBe("Richiamare alle 15")
    expect(vars.replacesAlertId).toBe(5)
    expect(new Date(vars.deadline).toDateString()).toBe(
      new Date(2026, 9, 20).toDateString()
    )
    expect(
      screen
        .getByRole("button", { name: "Salva richiamo" })
        .getAttribute("aria-busy")
    ).toBe("true")
  })

  it("un messaggio vuoto non crea un testo vuoto", async () => {
    const user = setup()
    await openForm(user)
    await pickDay(user, 20)
    await user.type(screen.getByPlaceholderText("Messaggio"), "   ")

    await save(user)

    expect((mocks.calls[0]!.vars as { message: unknown }).message).toBeNull()
    expect(
      (mocks.calls[0]!.vars as { replacesAlertId: unknown }).replacesAlertId
    ).toBeNull()
  })

  it("riuscito: chiude il modulo e aggiorna la pagina", async () => {
    const user = setup()
    await openForm(user)
    await pickDay(user, 20)
    await save(user)

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salva richiamo" })
      ).toBeNull()
    )
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.toast).not.toHaveBeenCalled()
  })
})

describe("quando il server non salva", () => {
  it("un collega ha impostato un altro richiamo: il modulo resta aperto con i dati e mostra quello attuale, senza toast (AC44)", async () => {
    const user = setup({ alert: openAlert })
    await openForm(user)
    await pickDay(user, 20)
    await user.type(
      screen.getByPlaceholderText("Messaggio"),
      "Il mio messaggio"
    )
    await save(user)
    const current = {
      id: 9,
      deadline: new Date("2026-10-25T22:00:00Z"),
      message: "Impostato da un collega",
    }

    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({
          code: "ALERT_CONFIRMATION_REQUIRED",
          payload: { alert: current },
        })
      )
    })

    expect(mocks.toast).not.toHaveBeenCalled()
    const note = screen.getByRole("status")
    expect(note.textContent).toContain(
      `Sostituisce il richiamo del ${formatDeadline(current.deadline)}`
    )
    expect(note.textContent).toContain("Impostato da un collega")
    expect(
      screen.getByPlaceholderText<HTMLInputElement>("Messaggio").value
    ).toBe("Il mio messaggio")

    // Saving again replaces the alert the form now names
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Salva richiamo" })
          .getAttribute("aria-busy")
      ).not.toBe("true")
    )
    await save(user)
    expect(mocks.calls).toHaveLength(2)
    expect(
      (mocks.calls[1]!.vars as { replacesAlertId: unknown }).replacesAlertId
    ).toBe(9)
  })

  it("una data oggi mandata fuori dall'interfaccia: toast 'da domani' e lo stesso testo dentro la Sheet", async () => {
    const user = setup()
    await openForm(user)
    await pickDay(user, 20)
    await save(user)

    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({ code: "DEADLINE_IN_PAST", payload: {} })
      )
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Il richiamo si imposta da domani",
      })
    )
    expect(mocks.announceAlert).toHaveBeenCalledWith(
      "Il richiamo si imposta da domani"
    )
  })

  it("la rete assente dice 'Modifica non salvata, riprova' e il modulo si può riprovare", async () => {
    const user = setup()
    await openForm(user)
    await pickDay(user, 20)
    await save(user)

    await act(async () => {
      mocks.calls[0]!.reject(new TypeError("fetch failed"))
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Modifica non salvata, riprova" })
    )
    expect(mocks.announceAlert).toHaveBeenCalledWith(
      "Modifica non salvata, riprova"
    )
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Salva richiamo" })
          .getAttribute("aria-busy")
      ).not.toBe("true")
    )
    expect(
      within(document.body).getByRole("button", { name: "Salva richiamo" })
    ).toBeTruthy()
  })
})
