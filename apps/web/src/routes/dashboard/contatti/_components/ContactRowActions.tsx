import { MoreHorizontal } from "lucide-react"
import { Link } from "react-router"

import { DropDownCilpBoard } from "@/components/custom/table/TableActions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type ContactRow } from "@mito/contract/task"
import { contactActionsId, customerNameId } from "../_lib/ids"
import {
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"

// The menu is rendered in a portal, but React still bubbles its clicks through
// the row that holds it: every click inside stops here, or the row would open
// the contact too
const stopClick = (event: React.MouseEvent) => {
  event.stopPropagation()
}

type Props = {
  contact: ContactRow
  state: ContactsListState
}

/**
 * The menu of a row: open the contact or the customer, copy the phone. Its name
 * is "Azioni per" and the name of the customer, read from the link of the row
 * (`aria-labelledby`): the Sentry Replay masks text, not attributes, and an
 * `aria-label` with the name would reach it in the clear.
 */
export function ContactRowActions({ contact, state }: Props) {
  const { customer } = contact
  const actionsId = contactActionsId(contact.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          id={actionsId}
          aria-label="Azioni per"
          aria-labelledby={`${actionsId} ${customerNameId(contact.id)}`}
          data-contact-actions=""
          onClick={stopClick}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stopClick}>
        <DropdownMenuItem
          asChild
          className="cursor-pointer"
          onClick={stopClick}
        >
          <Link to={detailHref(contact.id, state)} preventScrollReset>
            Apri contatto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="cursor-pointer"
          onClick={stopClick}
        >
          <Link to={`/dashboard/customers/${customer.id}`}>Apri cliente</Link>
        </DropdownMenuItem>
        {customer.phoneNumber ? (
          <DropDownCilpBoard
            label="Copia telefono"
            value={customer.phoneNumber}
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
