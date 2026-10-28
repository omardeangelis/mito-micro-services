import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type Role } from "@mito/contract/schemas"
import { type ContactDetail } from "@mito/contract/task"
import { contactDetail, fakeContacts } from "@/test/contacts"
import { renderContacts } from "../../_test/page"

/** The list state the detail carries in `da`, as the tests of Next.js */
export const DA = "stato=richiamare&pagina=2"

/** The address of the detail of `id`, with the list state `da` */
export const detailPath = (id: number, da?: string) =>
  da === undefined
    ? `/dashboard/contatti/${id}`
    : `/dashboard/contatti/${id}?da=${encodeURIComponent(da)}`

/**
 * Opens the detail of `details[0]` (by default the contact of `contactRow`,
 * editable) on the backend in memory, with the list state `da`, and waits
 * for its content. The other details are contacts the page can go to. The
 * list behind it is the one of `fakeContacts`. The user clicks through the
 * pointer checks: the sheet is modal, and the page under it takes no pointer
 */
export async function openDetail(
  details: ContactDetail[] = [contactDetail()],
  {
    da = DA,
    role,
    backend = fakeContacts({
      details: Object.fromEntries(
        details.map((detail) => [detail.contact.id, detail])
      ),
    }),
  }: {
    /** `null`: no list state */
    da?: string | null
    role?: Role | null
    backend?: ReturnType<typeof fakeContacts>
  } = {}
) {
  const view = renderContacts(
    detailPath(details[0]?.contact.id ?? 101, da ?? undefined),
    backend,
    { role, detail: true }
  )
  await findContent()
  return { ...view, backend, user: userEvent.setup({ pointerEventsCheck: 0 }) }
}

/** Waits for the content of a contact in the sheet */
export const findContent = () =>
  screen.findByText("Telefono", undefined, { timeout: 3000 })

/** The sheet of the detail */
export const sheet = () =>
  screen.getByRole("dialog", { name: "Dettaglio contatto" })

/**
 * The sheet also while a confirmation over it hides it to assistive
 * technology, which then reads no name
 */
const sheetElement = () =>
  document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!

/**
 * The link of a toast: the sheet is modal, so the region of the toasts is
 * hidden to assistive technology while it is open, and the sheet says the
 * text itself
 */
export const toastLink = (name: string) =>
  screen.getByRole("link", { name, hidden: true })

/** Holds the writes of the detail other than the state until it is called */
export const holdWrites = (backend: ReturnType<typeof fakeContacts>) => {
  let open!: () => void
  backend.state.writeGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return open
}

/** Holds the state changes until the returned function is called */
export const holdChanges = (backend: ReturnType<typeof fakeContacts>) => {
  let open!: () => void
  backend.state.changeGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return open
}

/** What the sheet said to assistive technology at once, last */
export const lastAlert = () =>
  sheetElement().querySelector('[role="alert"]')?.textContent ?? ""

/** What the sheet says politely: its first status, before the content */
export const sheetStatus = () =>
  sheetElement().querySelector<HTMLElement>('[role="status"]')!
