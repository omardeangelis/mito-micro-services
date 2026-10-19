import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import { type ContactRow } from "@/server/services/contact/getContacts"
import { defaultState, detailHref } from "../../_lib/searchParams"
import { ContactRowState } from "../ContactRowState"

type Call = {
  vars: Record<string, unknown>
  resolve: (value: { taskId: number; reopened: boolean }) => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  refresh: vi.fn(),
  toast: vi.fn(),
  actor: { role: "OPERATORE", operatorId: 7 } as {
    role: "ADMIN" | "OPERATORE"
    operatorId: number
  } | null,
}))

// Real `useMutation`, with a promise the test settles by hand
vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        changeState: {
          useMutation: () =>
            useMutation({
              mutationFn: (vars: Record<string, unknown>) =>
                new Promise<{ taskId: number; reopened: boolean }>(
                  (resolve, reject) => {
                    mocks.calls.push({ vars, resolve, reject })
                  }
                ),
            }),
        },
      },
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => mocks.actor,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    default: forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a"> & { prefetch?: boolean }
    >(function LinkMock({ href, children, prefetch: _p, ...rest }, ref) {
      return (
        <a ref={ref} href={href} {...rest}>
          {children}
        </a>
      )
    }),
  }
})

const contactOf = (overrides: Partial<ContactRow> = {}): ContactRow => ({
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: 7, name: "Mario", surname: "Verdi" },
  customer: {
    id: "c1",
    name: "Mario",
    surname: "Rossi",
    phoneNumber: "333 1234567",
    fiscalCode: "RSSMRA80A01H501U",
    vatCode: null,
    blackListStatus: "whitelisted",
    operatorId: 7,
  },
  alert: null,
  ...overrides,
})

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        path: "task.changeState",
        zodError: null,
        contactError,
      },
    },
  })

const setup = (contact: ContactRow = contactOf()) => {
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <ContactRowState
        contact={contact}
        state={defaultState}
        describedBy="cliente-101"
      />
    </QueryClientProvider>
  )
  return user
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")

const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  state: string
) => {
  await user.click(trigger()!)
  await user.click(screen.getByRole("menuitemradio", { name: state }))
}

beforeEach(() => {
  mocks.calls.length = 0
  mocks.refresh.mockClear()
  mocks.toast.mockClear()
  mocks.actor = { role: "OPERATORE", operatorId: 7 }
})

describe("la cella dello stato nella riga: chi può modificare (AC9, AC49, AC51)", () => {
  it("il proprietario del contatto ha il selettore, che porta il cliente nel nome accessibile", () => {
    setup()

    expect(trigger()).not.toBeNull()
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
    expect(trigger()!.getAttribute("aria-describedby")).toBe("cliente-101")
  })

  it("chi ha il cliente ma non il contatto lo modifica (D2)", () => {
    mocks.actor = { role: "OPERATORE", operatorId: 7 }
    const base = contactOf()
    setup(
      contactOf({
        operator: { id: 9, name: "Giulia", surname: "Bianchi" },
        customer: { ...base.customer, operatorId: 7 },
      })
    )

    expect(trigger()).not.toBeNull()
  })

  it("un amministratore modifica anche il contatto di un collega", () => {
    mocks.actor = { role: "ADMIN", operatorId: 1000 }
    setup(
      contactOf({ operator: { id: 9, name: "Giulia", surname: "Bianchi" } })
    )

    expect(trigger()).not.toBeNull()
  })

  it("il contatto di un collega mostra lo stato e a chi è assegnato, senza selettore", () => {
    const base = contactOf()
    setup(
      contactOf({
        operator: { id: 9, name: "Giulia", surname: "Bianchi" },
        customer: { ...base.customer, operatorId: 9 },
      })
    )

    expect(trigger()).toBeNull()
    expect(screen.getByText("chiamare")).toBeTruthy()
    expect(screen.getByText("Assegnato a Giulia Bianchi")).toBeTruthy()
  })

  it("un contatto non assegnato dice 'Non assegnato'", () => {
    const base = contactOf()
    setup(
      contactOf({
        operator: null,
        customer: { ...base.customer, operatorId: 9 },
      })
    )

    expect(trigger()).toBeNull()
    expect(screen.getByText("Non assegnato")).toBeTruthy()
  })

  it("un contatto superato dice 'Concluso' e non si modifica nella riga (AC3)", () => {
    setup(contactOf({ isActive: false }))

    expect(trigger()).toBeNull()
    expect(screen.getByText("Concluso")).toBeTruthy()
    expect(screen.getByText("chiamare")).toBeTruthy()
  })

  it("finché non si sa chi è l'utente mostra solo lo stato", () => {
    mocks.actor = null
    setup()

    expect(trigger()).toBeNull()
    expect(screen.getByText("chiamare")).toBeTruthy()
  })

  it("la cella ha la larghezza fissa w-40 con il selettore", () => {
    setup()

    expect(trigger()!.closest("div.w-40")).not.toBeNull()
  })

  it("la cella ha la larghezza fissa w-40 anche in sola lettura", () => {
    setup(contactOf({ isActive: false }))

    expect(screen.getByText("chiamare").closest("div.w-40")).not.toBeNull()
  })
})

describe("il cambio di stato nella riga (AC9, AC31, A9)", () => {
  it("salva con la sorgente 'list' e mostra il valore salvato finché il nuovo non è a schermo", async () => {
    const user = setup()

    await choose(user, "app.to")

    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]!.vars).toEqual({
      taskId: 101,
      toState: "app.to",
      source: "list",
      confirmedAlertId: null,
    })
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
    expect(trigger()!.getAttribute("aria-disabled")).toBe("true")
  })

  it("riuscito: toast educato di 5 secondi con il nome del cliente e lo stato, e la pagina si aggiorna", async () => {
    const user = setup()
    await choose(user, "app.to")

    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 101, reopened: false })
    })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "background",
        duration: 5000,
        description: "Rossi Mario: app.to",
      })
    )
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("riapertura: il toast dura 8 secondi e offre [Apri] sul contatto nuovo", async () => {
    const user = setup(contactOf({ state: "non interessato" }))
    await choose(user, "chiamare")

    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    const [options] = mocks.toast.mock.calls[0] as [
      {
        duration: number
        description: string
        action: {
          props: {
            altText: string
            children: { props: { href: string; children: string } }
          }
        }
      },
    ]
    expect(options.duration).toBe(8000)
    expect(options.description).toBe("Rossi Mario: chiamare")
    // Radix writes it in an attribute, which Sentry's replay does not mask:
    // the customer's name is in the description, which is text
    expect(options.action.props.altText).toBe("Apri il contatto riaperto")
    expect(options.action.props.children.props.href).toBe(
      detailHref(202, defaultState)
    )
    expect(options.action.props.children.props.children).toBe("Apri")
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("riselezionare lo stato attuale non è possibile: non c'è fra le opzioni (AC40)", async () => {
    const user = setup()

    await user.click(trigger()!)

    expect(screen.queryByRole("menuitemradio", { name: "chiamare" })).toBeNull()
    expect(mocks.calls).toHaveLength(0)
  })
})

describe("con un alert aperto (AC36, AC37)", () => {
  const alert = {
    id: 5,
    deadline: new Date("2026-10-20T22:00:00Z"),
    message: "Richiamare dopo le 15",
  }

  it("chiede la conferma, e annullando il focus torna sul selettore e non si salva niente", async () => {
    const user = setup(contactOf({ state: "richiamare" }))
    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({ code: "ALERT_CONFIRMATION_REQUIRED", payload: { alert } })
      )
    })

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Richiamare dopo le 15")).toBeTruthy()
    expect(mocks.toast).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("button", { name: "Annulla" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.calls).toHaveLength(1)
    expect(document.activeElement).toBe(trigger())
    expect(trigger()!.getAttribute("aria-label")).toBe(
      "richiamare, cambia stato"
    )
  })

  it("confermando rimanda il cambio con l'alert e poi mostra il toast con il nome del cliente", async () => {
    const user = setup(contactOf({ state: "richiamare" }))
    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({ code: "ALERT_CONFIRMATION_REQUIRED", payload: { alert } })
      )
    })

    await user.click(
      await screen.findByRole("button", { name: "Cambia stato" })
    )
    expect(mocks.calls[1]!.vars).toEqual({
      taskId: 101,
      toState: "erogata",
      source: "list",
      confirmedAlertId: 5,
    })
    await act(async () => {
      mocks.calls[1]!.resolve({ taskId: 101, reopened: false })
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Rossi Mario: erogata" })
    )
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("per i permessi: toast di rifiuto con il motivo, nessun toast di successo, valore salvato", async () => {
    const user = setup()
    await choose(user, "app.to")
    const error = rejection({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Giulia Bianchi" },
    })

    await act(async () => {
      mocks.calls[0]!.reject(error)
    })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        duration: 8000,
        description: describeContactError(error),
      })
    )
    expect(mocks.refresh).toHaveBeenCalled()
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger()!.getAttribute("aria-label")).toBe("chiamare, cambia stato")
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo", async () => {
    const user = setup()
    await choose(user, "app.to")

    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({
          code: "CONTACT_SUPERSEDED",
          payload: { activeTaskId: 303 },
        })
      )
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Questo contatto è stato sostituito da uno più recente",
        action: expect.anything() as unknown,
      })
    )
  })

  it("con la rete assente il valore torna indietro e dice 'Modifica non salvata, riprova' (AC39)", async () => {
    const user = setup()
    await choose(user, "app.to")

    await act(async () => {
      mocks.calls[0]!.reject(new TypeError("fetch failed"))
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Modifica non salvata, riprova" })
    )
    await waitFor(() =>
      expect(trigger()!.getAttribute("aria-disabled")).not.toBe("true")
    )
  })

  it("se la riga sparisce durante il salvataggio, il rifiuto mostra comunque il toast", async () => {
    const queryClient = new QueryClient({
      logger: { log: console.log, warn: console.warn, error: () => undefined },
    })
    const user = userEvent.setup()
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ContactRowState
          contact={contactOf()}
          state={defaultState}
          describedBy="cliente-101"
        />
      </QueryClientProvider>
    )
    await choose(user, "app.to")

    unmount()
    await act(async () => {
      mocks.calls[0]!.reject(
        rejection({ code: "CONTACT_FORBIDDEN", payload: { assignee: null } })
      )
    })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
