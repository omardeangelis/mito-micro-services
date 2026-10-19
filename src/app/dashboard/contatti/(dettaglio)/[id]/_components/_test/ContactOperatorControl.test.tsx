import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import { detailHrefFromDa } from "../../../../_lib/detailHrefFromDa"
import { ContactOperatorControl } from "../ContactOperatorControl"
import { lastToastActionHref } from "./toastActionHref"

type Call = {
  vars: Record<string, unknown>
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  onRefresh: () => undefined as void,
  toast: vi.fn(),
  announceAlert: vi.fn(),
}))

vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        reassign: {
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

const operators = [
  { id: 7, name: "Mario", surname: "Rossi" },
  { id: 9, name: "Giulia", surname: "Bianchi" },
  { id: 12, name: "Anna", surname: "Verdi" },
]

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        path: "task.reassign",
        zodError: null,
        contactError,
      },
    },
  })

const DA = "stato=richiamare&pagina=2"

/** The page: after the refresh the control gets the new saved operator. */
function Page({
  initial,
  afterRefresh,
}: {
  initial: number | null
  afterRefresh: number | null
}) {
  const [operatorId, setOperatorId] = useState(initial)
  mocks.onRefresh = () => setOperatorId(afterRefresh)
  return (
    <ContactOperatorControl
      taskId={101}
      operatorId={operatorId}
      operators={operators}
      da={DA}
    />
  )
}

const setup = (
  initial: number | null,
  afterRefresh: number | null = initial
) => {
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

const select = () => screen.getByRole("combobox", { name: "Cambia operatore" })

beforeEach(() => {
  mocks.calls.length = 0
  mocks.toast.mockClear()
  mocks.announceAlert.mockClear()
})

describe("l'operatore del contatto, per l'amministratore (AC47)", () => {
  it("mostra l'operatore attuale", () => {
    setup(9)

    expect(select().textContent).toContain("Giulia Bianchi")
  })

  it("senza operatore dice 'Non assegnato'", () => {
    setup(null)

    expect(select().textContent).toContain("Non assegnato")
  })

  it("offre gli operatori, senza 'Non assegnato'", async () => {
    const user = setup(9)

    await user.click(select())

    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["Anna Verdi", "Giulia Bianchi", "Mario Rossi"])
  })

  it("sceglierne un altro chiama task.reassign e mostra il valore salvato finché non arriva il nuovo", async () => {
    const user = setup(9, 12)
    await user.click(select())

    await user.click(screen.getByRole("option", { name: "Anna Verdi" }))

    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]!.vars).toEqual({ taskId: 101, operatorId: 12 })
    expect(select().textContent).toContain("Giulia Bianchi")
    expect(select().getAttribute("aria-disabled")).toBe("true")

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() => expect(select().textContent).toContain("Anna Verdi"))
  })

  it("il rifiuto del server: toast con il motivo, lo stesso testo dentro la Sheet e l'operatore salvato resta", async () => {
    const user = setup(9)
    await user.click(select())
    await user.click(screen.getByRole("option", { name: "Mario Rossi" }))
    const error = rejection({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: null },
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
      expect(select().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(select().textContent).toContain("Giulia Bianchi")
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const user = setup(9)
    await user.click(select())
    await user.click(screen.getByRole("option", { name: "Mario Rossi" }))

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
