import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import {
  CustomerColumns,
  type CustomerColumnSelectedProps,
} from "../CustomerColumns"

type Call = {
  vars: Record<string, unknown>
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  refresh: vi.fn(),
  toast: vi.fn(),
}))

// Real `useMutation`, with a promise the test settles by hand
vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  const useControlledMutation = () =>
    useMutation({
      mutationFn: (vars: Record<string, unknown>) =>
        new Promise<void>((resolve, reject) => {
          mocks.calls.push({ vars, resolve, reject })
        }),
    })
  return {
    api: {
      task: {
        changeState: { useMutation: useControlledMutation },
        createContact: { useMutation: useControlledMutation },
      },
    },
  }
})

// A server action: it pulls in `src/trpc/server.ts`, which needs Next's runtime
vi.mock("../../_actions/handleCustomerBlackList", () => ({
  handleCustomerBlackList: vi.fn(),
}))

const router = { refresh: mocks.refresh }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => ({ role: "OPERATORE", operatorId: 7 }),
}))

const toastApi = { toast: mocks.toast }
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => toastApi }))

const row = {
  id: "customer-1",
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
  tasks: {
    id: 321,
    operatorId: 7,
    operatorName: "Mario",
    operatorSurname: "Rossi",
    state: "chiamare",
  },
} as unknown as CustomerColumnSelectedProps

/** The "Stato Chiamate" cell, which renders the row's `StateSelector`. */
const stateCell = (original: CustomerColumnSelectedProps = row) => {
  const column = CustomerColumns.find((c) => c.id === "Stato Chiamate")!
  const cell = column.cell as (context: unknown) => React.ReactNode
  return cell({ row: { original } })
}

/** A row the signed-in operator (7) can't edit. */
const readOnlyRow = (
  customerOperator: { id: number; name: string; surname: string } | null,
  contactOperator: { id: number; name: string; surname: string } | null
) =>
  ({
    id: "customer-2",
    operatore: customerOperator,
    tasks: {
      id: 654,
      operatorId: contactOperator?.id ?? null,
      operatorName: contactOperator?.name ?? null,
      operatorSurname: contactOperator?.surname ?? null,
      state: "richiamare",
    },
  }) as unknown as CustomerColumnSelectedProps

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

const renderCell = (original: CustomerColumnSelectedProps) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      {stateCell(original)}
    </QueryClientProvider>
  )

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

beforeEach(() => {
  mocks.calls.length = 0
  mocks.refresh.mockClear()
  mocks.toast.mockClear()
})

describe("la cella Stato Chiamate della lista Clienti", () => {
  it("se la riga sparisce durante il salvataggio, il rifiuto mostra comunque il toast e aggiorna la pagina", async () => {
    // The rejections are expected: react-query would print each one
    const queryClient = new QueryClient({
      logger: { log: console.log, warn: console.warn, error: () => undefined },
    })
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        {stateCell()}
      </QueryClientProvider>
    )
    const user = userEvent.setup()
    await user.click(document.querySelector("[data-contact-state-trigger]")!)
    await user.click(screen.getByRole("menuitemradio", { name: "erogata" }))
    expect(mocks.calls).toHaveLength(1)

    unmount()
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
  })

  it("in sola lettura mostra solo lo stato, senza a chi è assegnato: lo dice la colonna Operatore", () => {
    renderCell(readOnlyRow(giulia, giulia))

    expect(screen.getByText("richiamare")).not.toBeNull()
    expect(screen.queryByText(/Assegnato a/)).toBeNull()
    expect(document.querySelector("[data-contact-state-trigger]")).toBeNull()
  })

  it("non nomina il collega nemmeno quando il cliente non ha operatore", () => {
    renderCell(readOnlyRow(null, giulia))

    expect(screen.getByText("richiamare")).not.toBeNull()
    expect(screen.queryByText(/Assegnato a/)).toBeNull()
    expect(screen.queryByText(/Assegna a te/)).toBeNull()
  })

  it("con cliente e contatto senza operatore indica “Assegna a te”", () => {
    renderCell(readOnlyRow(null, null))

    expect(screen.getByText("Non assegnato")).not.toBeNull()
    expect(screen.getByText(/Assegna a te/)).not.toBeNull()
  })

  it("con un contatto senza operatore di un cliente altrui mostra solo lo stato", () => {
    renderCell(readOnlyRow(giulia, null))

    expect(screen.getByText("richiamare")).not.toBeNull()
    expect(screen.queryByText("Non assegnato")).toBeNull()
  })
})
