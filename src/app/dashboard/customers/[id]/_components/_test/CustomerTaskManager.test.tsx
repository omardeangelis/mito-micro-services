import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Task } from "@/lib/types/schemas"
import {
  type ContactErrorData,
  type ContactErrorCode,
} from "@/lib/domain/contact/errors"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { formatDeadline } from "@/lib/utils/format"
import { CustomerTaskManager } from "../CustomerTaskManager"

type Call = {
  name: "changeState" | "setPriority"
  vars: Record<string, unknown>
  resolve: () => void
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
  const mutation = (name: Call["name"]) => () =>
    useMutation({
      mutationFn: (vars: Record<string, unknown>) =>
        new Promise<void>((resolve, reject) => {
          mocks.calls.push({ name, vars, resolve, reject })
        }),
    })
  return {
    api: {
      task: {
        changeState: { useMutation: mutation("changeState") },
        setPriority: { useMutation: mutation("setPriority") },
      },
      operator: {
        getOperatorById: {
          useQuery: () => ({
            data: { name: "Mario", surname: "Rossi" },
            isInitialLoading: false,
          }),
        },
      },
    },
  }
})

const router = { refresh: mocks.refresh }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => mocks.actor,
}))

const toastApi = { toast: mocks.toast }
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => toastApi }))

const task = {
  id: 321,
  operatorId: 7,
  state: "chiamare",
  priority: 0,
  customPriority: false,
  closedAt: null,
} as unknown as Task

/** The error as the client receives it over HTTP (see `errors.db.test.ts`). */
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

const forbidden: ContactErrorData = {
  code: "CONTACT_FORBIDDEN" satisfies ContactErrorCode,
  payload: { assignee: "Giulia Bianchi" },
}

const openAlert = {
  id: 55,
  deadline: new Date("2026-10-20T12:00:00Z"),
  message: "Richiamare dopo le 18",
}

function renderManager() {
  // The rejections are expected: react-query would print each one
  const queryClient = new QueryClient({
    logger: { log: console.log, warn: console.warn, error: () => undefined },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerTaskManager tasks={[task]} customerOperatorId={7} />
    </QueryClientProvider>
  )
}

/** Picks a state from the menu, so the save starts. */
async function chooseState(name: string) {
  const user = userEvent.setup()
  await user.click(document.querySelector("[data-contact-state-trigger]")!)
  await user.click(screen.getByRole("menuitemradio", { name }))
  return user
}

const lastCall = () => mocks.calls[mocks.calls.length - 1]!

beforeEach(() => {
  mocks.calls.length = 0
  mocks.refresh.mockClear()
  mocks.toast.mockClear()
  mocks.actor = { role: "OPERATORE", operatorId: 7 }
})

describe("CustomerTaskManager, il salvataggio dello stato", () => {
  it("se la scheda si chiude durante il salvataggio, il rifiuto mostra comunque il toast e aggiorna la pagina", async () => {
    const { unmount } = renderManager()
    await chooseState("erogata")
    expect(mocks.calls).toHaveLength(1)

    unmount()
    const error = rejection(forbidden)
    await act(async () => {
      lastCall().reject(error)
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
  })

  it("se la scheda si chiude durante il salvataggio, il successo aggiorna comunque la pagina", async () => {
    const { unmount } = renderManager()
    await chooseState("erogata")

    unmount()
    await act(async () => {
      lastCall().resolve()
    })

    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("con un richiamo aperto la modale mostra data e messaggio, senza toast, e confermare invia una sola chiamata con l'id del richiamo", async () => {
    renderManager()
    const user = await chooseState("erogata")

    await act(async () => {
      lastCall().reject(
        rejection({
          code: "ALERT_CONFIRMATION_REQUIRED",
          payload: { alert: openAlert },
        })
      )
    })

    const dialog = screen.getByRole("dialog")
    expect(
      within(dialog).getByText(new RegExp(formatDeadline(openAlert.deadline)!))
    ).not.toBeNull()
    expect(within(dialog).getByText(openAlert.message)).not.toBeNull()
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.calls).toHaveLength(1)

    await user.click(
      within(dialog).getByRole("button", { name: "Cambia stato" })
    )

    expect(mocks.calls).toHaveLength(2)
    expect(lastCall().name).toBe("changeState")
    expect(lastCall().vars).toMatchObject({
      taskId: 321,
      toState: "erogata",
      confirmedAlertId: 55,
    })
  })
})
