import React from "react"
import type * as ReactDom from "react-dom"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerSection } from "../CustomerSection"

// Il form del cliente nel dettaglio di una pratica manda al server action l'id
// del cliente insieme a email e telefono: senza, la modifica non salva niente

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactDom>()),
  useFormState: (action: unknown, initialState: unknown) => [
    initialState,
    action,
  ],
  useFormStatus: () => ({ pending: false }),
}))
vi.mock("../../_actions/updateCustomerPreview", () => ({
  updateCustomerPreviewAction: vi.fn(),
}))
vi.mock("@/lib/hooks/useFormIssueManager", () => ({
  useFormIssueManager: () => undefined,
}))
vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    select: (state: { role: string; operatorId: number }) => unknown
  ) => select({ role: "ADMIN", operatorId: 1 }),
}))

afterEach(cleanup)

const customer = {
  id: "Xk3bT9qLm2",
  name: "Mario",
  surname: "Rossi",
  email: "mario.rossi@example.com",
  fiscalCode: "RSSMRA80A01H501U",
  vatCode: null,
  phoneNumber: "3331234567",
  operatorId: 1,
  blackListStatus: "whitelisted",
  customerRole: "Intestatario",
} as React.ComponentProps<typeof CustomerSection>

describe("CustomerSection", () => {
  it("il form manda l'id del cliente, che è testo", () => {
    const { container } = render(
      <CollassableSection defaultValue={["item-1"]}>
        <CustomerSection {...customer} />
      </CollassableSection>
    )

    const form = container.querySelector<HTMLFormElement>("#customer-preview")
    const sent = Object.fromEntries(new FormData(form!).entries())

    expect(sent).toMatchObject({
      id: "Xk3bT9qLm2",
      email: "mario.rossi@example.com",
      phoneNumber: "3331234567",
    })
  })
})
