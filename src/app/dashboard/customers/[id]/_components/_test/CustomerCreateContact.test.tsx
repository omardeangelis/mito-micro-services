import React, { useState } from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { type ContactErrorData } from "@/lib/domain/contact/errors"
import { CustomerCreateContact } from "../CustomerCreateContact"

// Dopo "Crea contatto" la pagina si aggiorna e al posto della card compare il
// riepilogo con "Gestisci contatto": il focus passa a quel link, non resta su
// `body` (AC66). Vale anche se nel frattempo il contatto c'era già (AC67)

type Call = { resolve: () => void; reject: (error: unknown) => void }

type TestActor = { role: "ADMIN" | "OPERATORE"; operatorId: number }

const ADMIN: TestActor = { role: "ADMIN", operatorId: 1000 }

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  refresh: vi.fn(),
  toast: vi.fn(),
  actor: null as TestActor | null,
}))

// `useMutation` vera, con una promessa che il test risolve a mano
vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        createContact: {
          useMutation: () =>
            useMutation({
              mutationFn: () =>
                new Promise<void>((resolve, reject) => {
                  mocks.calls.push({ resolve, reject })
                }),
            }),
        },
      },
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))
vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => mocks.actor,
}))

beforeEach(() => {
  mocks.calls.length = 0
  mocks.toast.mockClear()
  mocks.actor = ADMIN
})
afterEach(cleanup)

/**
 * La pagina: finché il cliente non ha un contatto mostra la card; il refresh
 * del router la sostituisce con il link "Gestisci contatto", come il riepilogo.
 */
function Page({
  contactAfterRefresh = true,
}: {
  contactAfterRefresh?: boolean
}) {
  const [hasContact, setHasContact] = useState(false)
  mocks.refresh.mockImplementation(() => {
    if (contactAfterRefresh) setHasContact(true)
  })
  return (
    <>
      <input aria-label="Altro campo" />
      {hasContact ? (
        <a href="/dashboard/contatti/321" data-contact-manage-link="">
          Gestisci contatto
        </a>
      ) : (
        <CustomerCreateContact customerId="customer-1" customerOperatorId={7} />
      )}
    </>
  )
}

const rejection = (contactError: ContactErrorData) =>
  TRPCClientError.from({
    error: {
      message: contactError.code,
      code: -32603,
      data: {
        code: "CONFLICT",
        httpStatus: 409,
        path: "task.createContact",
        zodError: null,
        contactError,
      },
    },
  })

const manageLink = () => screen.getByRole("link", { name: "Gestisci contatto" })

async function clickCreate(contactAfterRefresh = true) {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page contactAfterRefresh={contactAfterRefresh} />
    </QueryClientProvider>
  )
  await user.click(screen.getByRole("button", { name: /Crea contatto/ }))
  await waitFor(() => expect(mocks.calls).toHaveLength(1))
}

describe("CustomerCreateContact, il focus dopo il successo", () => {
  it("passa a 'Gestisci contatto' quando il contatto è creato", async () => {
    await clickCreate()
    mocks.calls[0]!.resolve()

    await waitFor(() => expect(manageLink()).not.toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(manageLink()))
  })

  it("passa a 'Gestisci contatto' anche se il cliente aveva già un contatto (CONTACT_ALREADY_ACTIVE)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await clickCreate()
    mocks.calls[0]!.reject(
      rejection({
        code: "CONTACT_ALREADY_ACTIVE",
        payload: { activeTaskId: 321 },
      })
    )

    await waitFor(() => expect(manageLink()).not.toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(manageLink()))
    // Il messaggio dice perché non se n'è creato un secondo
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })

  it("con un altro errore la card resta e il focus non va al link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    // Nessun contatto nuovo: il refresh mostra ancora la card
    await clickCreate(false)
    mocks.calls[0]!.reject(
      rejection({ code: "CUSTOMER_UNASSIGNED", payload: {} })
    )

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("link", { name: "Gestisci contatto" })).toBeNull()
    expect(screen.getByRole("button", { name: /Crea contatto/ })).not.toBeNull()
  })
})

describe("CustomerCreateContact, il focus non si ruba", () => {
  it("se l'operatore ha già spostato il focus su un altro controllo, 'Gestisci contatto' non lo prende", async () => {
    await clickCreate()
    const other = screen.getByLabelText("Altro campo")
    act(() => other.focus())
    expect(document.activeElement).toBe(other)

    mocks.calls[0]!.resolve()

    await waitFor(() => expect(manageLink()).not.toBeNull())
    // Il tempo che l'osservatore del focus avrebbe per muoverlo
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.activeElement).toBe(other)
  })
})

describe("CustomerCreateContact, chi vede il pulsante (AC66)", () => {
  const renderCard = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerCreateContact customerId="customer-1" customerOperatorId={7} />
      </QueryClientProvider>
    )

  it.each<[string, TestActor | null]>([
    [
      "un OPERATORE che non è l'operatore del cliente",
      { role: "OPERATORE", operatorId: 99 },
    ],
    ["chi non ha ancora un operatore", null],
  ])("%s non vede 'Crea contatto'", (_who, actor) => {
    mocks.actor = actor
    renderCard()

    expect(screen.queryByRole("button", { name: /Crea contatto/ })).toBeNull()
    expect(
      screen.queryByText("Il cliente non ha un contatto attivo")
    ).toBeNull()
  })

  it.each<[string, TestActor]>([
    ["l'operatore del cliente", { role: "OPERATORE", operatorId: 7 }],
    ["un amministratore", ADMIN],
  ])("%s vede 'Crea contatto'", (_who, actor) => {
    mocks.actor = actor
    renderCard()

    expect(screen.getByRole("button", { name: /Crea contatto/ })).not.toBeNull()
  })
})
