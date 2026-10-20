import { CustomerChatSection } from "@/components/custom/notes/CustomerChatSection"

type Props = {
  customerId: string
  /** The `limit` of the address: how many messages the chat shows first */
  limit?: number
}

/**
 * The customer's chat in the detail of a contact (AC53, AC54, AC56, AC57): the
 * same chat the customer card shows. A Server Component with no Suspense: the
 * detail page awaits it, so a new id never flashes a fallback.
 */
export function ContactNotes({ customerId, limit }: Props) {
  return <CustomerChatSection customerId={customerId} limit={limit} />
}
