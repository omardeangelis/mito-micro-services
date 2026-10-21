import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@mito/domain/contact/errors"
import { detailHrefFromDa } from "../../../../_lib/detailHrefFromDa"
import { ContactStateControl } from "../ContactStateControl"
import { lastToastActionHref } from "./toastActionHref"

type Call = {
  vars: Record<string, unknown>
  resolve: (value: { taskId: number; reopened: boolean }) => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  order: [] as string[],
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  announce: vi.fn(),
  announceAlert: vi.fn(),
  focusStateTriggerOnNextMount: vi.fn(),
  consumeStateTriggerFocus: vi.fn(() => false),
  isClosing: vi.fn(() => false),
  setReopening: vi.fn(),
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
    refresh: () => {
      mocks.order.push("refresh")
      mocks.refresh()
    },
    replace: (href: string) => {
      mocks.order.push("replace")
      mocks.replace(href)
    },
    push: (href: string) => {
      mocks.push(href)
    },
  }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

// The shell is tested on its own: here it is the API the control calls
vi.mock("../../../_components/ContactSheet", () => ({
  useContactSheet: () => ({
    announce: mocks.announce,
    announceAlert: mocks.announceAlert,
    focusStateTriggerOnNextMount: mocks.focusStateTriggerOnNextMount,
    consumeStateTriggerFocus: mocks.consumeStateTriggerFocus,
    isClosing: mocks.isClosing,
    setReopening: mocks.setReopening,
    focusTitle: vi.fn(),
  }),
}))

const DA = "stato=richiamare&pagina=2"

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

const setup = (
  state: React.ComponentProps<typeof ContactStateControl>["state"] = "app.to"
) => {
  // The rejections are expected: react-query would print each one
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <ContactStateControl taskId={101} state={state} da={DA} />
    </QueryClientProvider>
  )
  return user
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")!

const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  state: string
) => {
  await user.click(trigger())
  await user.click(screen.getByRole("menuitemradio", { name: state }))
}

beforeEach(() => {
  mocks.calls.length = 0
  mocks.order.length = 0
  for (const mock of [
    mocks.refresh,
    mocks.replace,
    mocks.push,
    mocks.toast,
    mocks.announce,
    mocks.announceAlert,
    mocks.focusStateTriggerOnNextMount,
    mocks.setReopening,
  ]) {
    mock.mockClear()
  }
  mocks.isClosing.mockReset()
  mocks.isClosing.mockReturnValue(false)
  mocks.consumeStateTriggerFocus.mockReset()
  mocks.consumeStateTriggerFocus.mockReturnValue(false)
})

describe("il selettore dello stato nel dettaglio (AC30, AC39, AC40)", () => {
  it("salva con la sorgente 'detail', mostra il valore salvato finché non è a schermo il nuovo e poi aggiorna la pagina", async () => {
    const user = setup("app.to")

    await choose(user, "erogata")

    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]!.vars).toEqual({
      taskId: 101,
      toState: "erogata",
      source: "detail",
      confirmedAlertId: null,
    })
    // The saved value stays, the wait is shown, a second change is not sent
    expect(trigger().getAttribute("aria-label")).toBe("app.to, cambia stato")
    expect(trigger().getAttribute("aria-disabled")).toBe("true")

    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 101, reopened: false })
    })

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.announce).not.toHaveBeenCalled()
  })

  it("non offre lo stato attuale: riselezionarlo non chiama il server (AC40)", async () => {
    const user = setup("app.to")

    await user.click(trigger())

    expect(screen.queryByRole("menuitemradio", { name: "app.to" })).toBeNull()
    expect(mocks.calls).toHaveLength(0)
  })
})

describe("la riapertura (AC34, AC35, A12)", () => {
  it("sostituisce l'indirizzo con quello del contatto nuovo, conserva la vista della lista e lo annuncia", async () => {
    const user = setup("non interessato")

    await choose(user, "chiamare")
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    // replace, not push: "Indietro" must not return to the superseded contact
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith(detailHrefFromDa(202, DA))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.announce).toHaveBeenCalledWith(
      "Contatto riaperto. Il precedente resta tra i contatti precedenti"
    )
    // The new selector takes the focus when it mounts
    expect(mocks.focusStateTriggerOnNextMount).toHaveBeenCalledTimes(1)
  })

  it("rinfresca anche la lista nella cache del router: Indietro ed Esc non mostrano il contatto sostituito come attivo (AC35, AC2, AC3)", async () => {
    const user = setup("non interessato")

    await choose(user, "chiamare")
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    // After the replace: the refresh is of the address of the new contact
    expect(mocks.order).toEqual(["replace", "refresh"])
  })

  it("se il controllo non c'è più (Sheet chiusa, altro contatto) non naviga: aggiorna soltanto", async () => {
    const user = setup("non interessato")

    await choose(user, "chiamare")
    cleanup()
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.focusStateTriggerOnNextMount).not.toHaveBeenCalled()
    // The list under the closed sheet shows the new contact
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})

describe("la riapertura e la chiusura della Sheet (AC25, AC35)", () => {
  it("se la Sheet sta già chiudendo non naviga: la sua navigazione verrebbe scartata e Indietro porterebbe al contatto sostituito", async () => {
    const user = setup("non interessato")

    await choose(user, "chiamare")
    mocks.isClosing.mockReturnValue(true)
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.focusStateTriggerOnNextMount).not.toHaveBeenCalled()
    // The list under the closing sheet shows the new contact
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("dice alla Sheet che la navigazione è in corso e lo toglie quando finisce, o quando il controllo se ne va", async () => {
    const user = setup("non interessato")

    await choose(user, "chiamare")
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 202, reopened: true })
    })

    expect(mocks.setReopening).toHaveBeenCalledWith(true)
    expect(mocks.setReopening).toHaveBeenLastCalledWith(false)
  })
})

describe("con un alert aperto (AC36, AC37)", () => {
  const alert = {
    id: 5,
    deadline: new Date("2026-10-20T22:00:00Z"),
    message: "Richiamare dopo le 15",
  }
  const confirmationRequired = () =>
    rejection({ code: "ALERT_CONFIRMATION_REQUIRED", payload: { alert } })

  it("chiede la conferma con la data e il messaggio, senza toast e senza aggiornare la pagina", async () => {
    const user = setup("richiamare")

    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(confirmationRequired())
    })

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Richiamare dopo le 15")).toBeTruthy()
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.announceAlert).not.toHaveBeenCalled()
  })

  it("Annulla non cambia niente e riporta il focus sul selettore", async () => {
    const user = setup("richiamare")
    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(confirmationRequired())
    })

    await user.click(await screen.findByRole("button", { name: "Annulla" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.calls).toHaveLength(1)
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute("aria-label")).toBe(
      "richiamare, cambia stato"
    )
  })

  it("Esc annulla allo stesso modo", async () => {
    const user = setup("richiamare")
    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(confirmationRequired())
    })
    await screen.findByRole("dialog")

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.calls).toHaveLength(1)
    expect(document.activeElement).toBe(trigger())
  })

  it("'Cambia stato' rimanda il cambio confermando l'alert", async () => {
    const user = setup("richiamare")
    await choose(user, "erogata")
    await act(async () => {
      mocks.calls[0]!.reject(confirmationRequired())
    })

    await user.click(
      await screen.findByRole("button", { name: "Cambia stato" })
    )

    expect(mocks.calls).toHaveLength(2)
    expect(mocks.calls[1]!.vars).toEqual({
      taskId: 101,
      toState: "erogata",
      source: "detail",
      confirmedAlertId: 5,
    })
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("per i permessi: toast con il motivo, lo stesso testo per gli ausili dentro la Sheet, valore salvato", async () => {
    const user = setup("app.to")
    await choose(user, "erogata")
    const error = rejection({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Giulia Bianchi" },
    })

    await act(async () => {
      mocks.calls[0]!.reject(error)
    })

    const reason = describeContactError(error)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: reason })
    )
    // The toast region is hidden to assistive technology while the Sheet is open
    expect(mocks.announceAlert).toHaveBeenCalledWith(reason)
    expect(mocks.refresh).toHaveBeenCalled()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(trigger().getAttribute("aria-label")).toBe("app.to, cambia stato")
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo", async () => {
    const user = setup("app.to")
    await choose(user, "erogata")

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
    expect(mocks.announceAlert).toHaveBeenCalledWith(
      "Questo contatto è stato sostituito da uno più recente"
    )
    expect(lastToastActionHref(mocks.toast)).toBe(detailHrefFromDa(303, DA))
  })

  it("con la rete assente dice 'Modifica non salvata, riprova' (AC39)", async () => {
    const user = setup("app.to")
    await choose(user, "erogata")

    await act(async () => {
      mocks.calls[0]!.reject(new TypeError("fetch failed"))
    })

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Modifica non salvata, riprova" })
    )
    expect(mocks.announceAlert).toHaveBeenCalledWith(
      "Modifica non salvata, riprova"
    )
  })
})

describe("il focus al montaggio", () => {
  it("lo prende il selettore se il guscio ha il flag alzato (riapertura, 'Vai al contatto attivo')", () => {
    mocks.consumeStateTriggerFocus.mockReturnValueOnce(true)

    setup("chiamare")

    expect(document.activeElement).toBe(trigger())
  })

  it("senza il flag non tocca il focus", () => {
    setup("chiamare")

    expect(document.activeElement).toBe(document.body)
  })
})
