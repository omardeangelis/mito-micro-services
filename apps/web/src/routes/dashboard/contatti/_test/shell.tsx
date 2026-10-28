import { act, render } from "@testing-library/react"
import { useMemo, type ReactNode } from "react"
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from "react-router"
import { onTestFinished } from "vitest"
import {
  defaultState,
  parse,
  serialize,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { ContactsListShell } from "../_components/ContactsListShell"
import { listHref } from "../_lib/listHref"

/** A navigation of the router: where it went, and whether it kept the scroll */
export type Navigation = { to: string; preventScrollReset: boolean }

/**
 * Renders `ui(address)` inside `ContactsListShell`, on a router in memory
 * at the list of `initial`: the address of the list is the one of the
 * router, so a navigation of the shell lands as in the app, and the shell
 * hears the page of every address at once (`listPending` false, as a page
 * already read). `navigations` are those the code under test made, as
 * "PUSH /dashboard/contatti?…"; `land(state)` brings the router to the list
 * of `state` as a link or "Indietro" would, out of `navigations`
 */
export function renderInShell(
  ui: (address: ContactsListState) => ReactNode,
  initial: ContactsListState = defaultState
) {
  function List() {
    const [searchParams] = useSearchParams()
    const address = useMemo(
      () => parse(Object.fromEntries(searchParams)),
      [searchParams]
    )
    return (
      <ContactsListShell listPending={false} shownAddress={serialize(address)}>
        {ui(address)}
      </ContactsListShell>
    )
  }

  const router = createMemoryRouter(
    [
      { path: "/dashboard/contatti", element: <List /> },
      { path: "*", element: <p>altra pagina</p> },
    ],
    { initialEntries: [listHref(initial)] }
  )
  const navigations: string[] = []
  const options: Navigation[] = []
  let external = false
  let lastKey = router.state.location.key
  const unsubscribe = router.subscribe((state) => {
    if (state.location.key === lastKey) return
    lastKey = state.location.key
    if (external) return
    const to = `${state.location.pathname}${state.location.search}`
    navigations.push(`${state.historyAction} ${to}`)
    options.push({ to, preventScrollReset: state.preventScrollReset })
  })
  onTestFinished(() => {
    unsubscribe()
    router.dispose()
  })

  const view = render(<RouterProvider router={router} />)
  return {
    ...view,
    router,
    navigations,
    options,
    land: async (state: ContactsListState) => {
      external = true
      await act(() => router.navigate(listHref(state)))
      external = false
    },
  }
}

/** Renders `useHook` in the shell, as `renderHook` would */
export function renderHookInShell<T>(
  useHook: (address: ContactsListState) => T,
  initial: ContactsListState = defaultState
) {
  const result = { current: undefined as T }
  function Probe({ address }: { address: ContactsListState }) {
    result.current = useHook(address)
    return null
  }
  const view = renderInShell((address) => <Probe address={address} />, initial)
  return { ...view, result }
}
