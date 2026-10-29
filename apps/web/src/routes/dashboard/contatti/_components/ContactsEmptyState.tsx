import { Link } from "react-router"

import { buttonVariants } from "@/components/ui/button"
import { type CustomerFilter } from "@mito/contract/task"
import { listHref } from "../_lib/listHref"
import {
  activeFilters,
  defaultState,
  type ActiveFilterKey,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useContactsNavigation } from "./ContactsListShell"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"

/** The filters as the reader knows them, not as the address spells them */
const filterNames: Record<ActiveFilterKey, string> = {
  q: "Ricerca",
  operatore: "Operatore",
  stato: "Stato",
  priorita: "Priorità",
  data: "Data",
  miei: "Solo i miei",
  alert: "Con alert",
  cliente: "Cliente",
  precedenti: "Contatti chiusi",
}

type Props = {
  /** How many rows the list shows: the message is only for none */
  rowCount: number
  /** All the contacts the filters match, not only this page's */
  total: number
  state: ContactsListState
  /** Null when the list is not filtered by a customer */
  customerFilter: CustomerFilter | null
}

type Message = {
  text: string
  /**
   * What the reader can do, as a link. `update` is the move on the list, over
   * the state it is heading to; an action out of the list has none.
   */
  action: {
    label: string
    href: string
    update?: (base: ContactsListState) => ContactsListState
  } | null
  /** The filters in force, when the message is about them */
  filters: ActiveFilterKey[]
}

/**
 * What an empty list says. The customer decides first, from the customer's own
 * total (all their contacts, whatever the other filters), never from the list
 * being empty: with other filters on, or the previous contacts left out, the
 * customer may well have contacts.
 */
function messageOf({
  total,
  state,
  customerFilter,
}: Omit<Props, "rowCount">): Message {
  const { customerId } = state

  if (customerFilter && !customerFilter.found) {
    return { text: "Cliente non trovato", action: null, filters: [] }
  }

  if (
    customerFilter?.found &&
    customerFilter.totalContacts === 0 &&
    customerId !== undefined
  ) {
    return {
      text: "Questo cliente non ha contatti",
      action: {
        label: "Apri scheda cliente",
        href: `/dashboard/customers/${encodeURIComponent(customerId)}`,
      },
      filters: [],
    }
  }

  if (total > 0 && state.page > 1) {
    return {
      text: `La pagina ${state.page} non esiste.`,
      action: {
        label: "Vai alla prima pagina",
        href: listHref({ ...state, page: 1 }),
        update: (base) => ({ ...base, page: 1 }),
      },
      filters: [],
    }
  }

  const filters = activeFilters(state)
  const onlyMine = filters.length === 1 && filters[0] === "miei"

  return {
    text: onlyMine ? "Non hai contatti assegnati" : "Nessun contatto trovato",
    action:
      filters.length > 0
        ? {
            label: "Azzera filtri",
            href: listHref(defaultState),
            update: () => defaultState,
          }
        : null,
    filters,
  }
}

/**
 * The message under the table when the list has no rows. The container is
 * always mounted, even with rows, so a screen reader announces the message when
 * it appears instead of missing a region that arrives with its content.
 */
export function ContactsEmptyState({ rowCount, ...rest }: Props) {
  const { navigate, navigateWith } = useContactsNavigation()
  const { state } = rest
  const message = rowCount === 0 ? messageOf(rest) : null

  return (
    <div role="status">
      {message ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="font-medium">{message.text}</p>
          {message.filters.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {`Filtri attivi: ${message.filters
                .map((key) => filterNames[key])
                .join(", ")}`}
            </p>
          ) : null}
          {message.action ? (
            <Link
              to={message.action.href}
              className={buttonVariants({ variant: "outline" })}
              onClick={navigateOnPlainClick((href) => {
                const { update } = message.action!
                if (update) navigateWith(state, update)
                else navigate(href)
              }, message.action.href)}
            >
              {message.action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
