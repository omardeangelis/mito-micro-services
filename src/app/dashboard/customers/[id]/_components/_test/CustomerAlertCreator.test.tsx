import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Alert } from "@/lib/types/schemas"
import { CustomerAlertCreator } from "../CustomerAlertCreator"

const mocks = vi.hoisted(() => ({
  resolveAlert: [] as Array<() => void>,
  // What the router refresh does to the page: set by the harness
  onRefresh: () => undefined as void,
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
              mutationFn: () => new Promise<void>(() => undefined),
            }),
        },
        resolveAlert: {
          useMutation: () =>
            useMutation({
              mutationFn: () =>
                new Promise<void>((resolve) => {
                  mocks.resolveAlert.push(resolve)
                }),
            }),
        },
      },
    },
  }
})

const router = { refresh: () => mocks.onRefresh() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => ({ role: "OPERATORE", operatorId: 7 }),
}))

const toastApi = { toast: vi.fn() }
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => toastApi }))

const openAlert = {
  id: 55,
  deadline: new Date("2099-10-20T12:00:00Z"),
  message: "Richiamare dopo le 18",
  isResolved: false,
} as unknown as Alert

/** The page: the refresh after the save drops the closed alert from it. */
function Page() {
  const [alert, setAlert] = useState<Alert | undefined>(openAlert)
  mocks.onRefresh = () => setAlert(undefined)
  return (
    // `creatable` false: legacy data, so there is no "Imposta richiamo"
    <CustomerAlertCreator
      task={{ id: 321, operatorId: 7 }}
      customerOperatorId={7}
      alert={alert}
      creatable={false}
    />
  )
}

beforeEach(() => {
  mocks.resolveAlert.length = 0
})

describe("CustomerAlertCreator, chiudere il richiamo con la X", () => {
  it("senza 'Imposta richiamo' il focus non cade sul body: va al testo che prende il posto del richiamo", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Chiudi il richiamo" }))
    await act(async () => {
      mocks.resolveAlert[0]!()
    })

    expect(
      screen.queryByRole("button", { name: "Chiudi il richiamo" })
    ).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByText(/Solo i clienti che non sono da chiamare/)
    )
  })
})
