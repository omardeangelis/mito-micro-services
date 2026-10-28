import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@mito/server/services/contact/getContacts"
import { defaultState } from "@mito/client/contact/searchParams"
import { ContactFilters } from "../ContactFilters"
import { ContactsListShell } from "../ContactsListShell"
import { ContactsTable } from "../ContactsTable"
import { HiddenColumnsProvider } from "../hiddenColumns"

const mocks = vi.hoisted(() => ({
  setContactTableVisibleColumns: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// The cell of the state has its own tests (it calls the server)
vi.mock("../ContactRowState", () => ({
  ContactRowState: ({ contact }: { contact: { state: string | null } }) => (
    <span>{contact.state ?? "nessuno"}</span>
  ),
}))

vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      setContactTableVisibleColumns: mocks.setContactTableVisibleColumns,
    }),
}))

const contact: ContactRow = {
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: 9, name: "Giulia", surname: "Bianchi" },
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
}

// The menu is in the filter bar, the columns in the table: as the page has them
const renderList = (hiddenColumns: string[]) =>
  render(
    <ContactsListShell>
      <HiddenColumnsProvider initial={hiddenColumns}>
        <ContactFilters state={defaultState} operators={[]} />
        <ContactsTable
          contacts={[contact]}
          total={1}
          state={defaultState}
          hiddenColumns={hiddenColumns}
          now={new Date("2026-10-15T10:00:00Z")}
        />
      </HiddenColumnsProvider>
    </ContactsListShell>
  )

const headers = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent?.trim())

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.fetch.mockResolvedValue({ ok: true })
  vi.stubGlobal("fetch", mocks.fetch)
})

describe("nascondere Telefono e CF dalla tabella (AC5)", () => {
  it("la colonna sparisce subito e torna quando si rimostra", async () => {
    const user = userEvent.setup()
    renderList([])
    expect(headers()).toContain("Telefono")

    await user.click(screen.getByRole("button", { name: "Colonne" }))
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(headers()).not.toContain("Telefono")
    expect(headers()).toContain("CF")
    expect(screen.queryByText("333 1234567")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Colonne" }))
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(headers()).toContain("Telefono")
    expect(screen.getByText("333 1234567")).toBeTruthy()
  })

  it("parte dalle colonne che l'operatore aveva già nascoste", async () => {
    const user = userEvent.setup()
    renderList(["CF"])

    expect(headers()).not.toContain("CF")
    await user.click(screen.getByRole("button", { name: "Colonne" }))
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "CF" })
        .getAttribute("aria-checked")
    ).toBe("false")
  })
})
