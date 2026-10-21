import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@mito/domain/contact/errors"
import { detailHrefFromDa } from "../../../../_lib/detailHrefFromDa"
import { ContactAlertCloseButton } from "../ContactAlertCloseButton"
import { lastToastActionHref } from "./toastActionHref"

type Call = {
  vars: Record<string, unknown>
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  onRefresh: () => undefined as void,
  // The server closed the alert: what the refresh brings back
  serverClosed: false,
  toast: vi.fn(),
  announceAlert: vi.fn(),
}))

vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        resolveAlert: {
          useMutation: () =>
            useMutation({
              mutationFn: (vars: Record<string, unknown>) =>
                new Promise<void>((resolve, reject) => {
                  mocks.calls.push({
                    vars,
                    resolve: () => {
                      mocks.serverClosed = true
                      resolve()
                    },
                    reject,
                  })
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

const DA = "stato=richiamare&pagina=2"

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        path: "task.resolveAlert",
        zodError: null,
        contactError,
      },
    },
  })

/**
 * The page around the "X": the alert section with its heading, the "Imposta
 * richiamo" button when the state allows it, and the "X" while an alert is
 * open. The refresh after the save drops the alert, as the server would.
 */
function Page({ withCallbackButton }: { withCallbackButton: boolean }) {
  const [open, setOpen] = useState(true)
  // A server that rejected still has the alert: only a close that worked drops it
  mocks.onRefresh = () => setOpen(!mocks.serverClosed)
  return (
    <section aria-labelledby="titolo">
      <h3 id="titolo" tabIndex={-1} data-alert-section-heading="">
        Prossimo alert
      </h3>
      {withCallbackButton ? (
        <button type="button" data-callback-trigger="">
          Imposta richiamo
        </button>
      ) : null}
      {open ? (
        <ContactAlertCloseButton alertId={5} da={DA} />
      ) : (
        <p>Nessun alert aperto</p>
      )}
    </section>
  )
}

const setup = (withCallbackButton = true) => {
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <Page withCallbackButton={withCallbackButton} />
    </QueryClientProvider>
  )
  return user
}

const closeButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Chiudi il richiamo" })

beforeEach(() => {
  mocks.calls.length = 0
  mocks.serverClosed = false
  mocks.toast.mockClear()
  mocks.announceAlert.mockClear()
})

describe("la X dell'alert aperto (AC29)", () => {
  it("chiude l'alert con la sorgente 'detail' e dice che sta salvando", async () => {
    const user = setup()

    await user.click(closeButton())

    expect(mocks.calls).toHaveLength(1)
    expect(mocks.calls[0]!.vars).toEqual({ alertId: 5, source: "detail" })
    expect(closeButton().getAttribute("aria-busy")).toBe("true")
    expect(closeButton().getAttribute("aria-disabled")).toBe("true")
  })

  it("non si invia due volte durante il salvataggio", async () => {
    const user = setup()

    await user.click(closeButton())
    await user.click(closeButton())

    expect(mocks.calls).toHaveLength(1)
  })

  it("dopo la chiusura il focus va a 'Imposta richiamo'", async () => {
    const user = setup(true)
    await user.click(closeButton())

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Imposta richiamo" })
      )
    )
  })

  it("senza 'Imposta richiamo' il focus va al titolo della sezione, mai su body", async () => {
    const user = setup(false)
    await user.click(closeButton())

    await act(async () => {
      mocks.calls[0]!.resolve()
    })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Prossimo alert" })
      )
    )
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("toast con il motivo e lo stesso testo dentro la Sheet; l'alert resta e il pulsante torna attivo", async () => {
    const user = setup()
    await user.click(closeButton())
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
      expect(closeButton().getAttribute("aria-busy")).not.toBe("true")
    )
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const user = setup()
    await user.click(closeButton())

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
