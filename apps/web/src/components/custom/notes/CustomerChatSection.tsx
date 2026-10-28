import { useRef } from "react"
import { useSearchParams } from "react-router"
import { type ChatMessage } from "@mito/contract/chat"
import { useChatMessages } from "@/api/chat"
import { useCustomer } from "@/api/customer"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerChat, CustomerNewChat, CustomerNotes } from "./CustomerChat"
import { chatLimitOf } from "./chatLimit"

/**
 * The notes of the customer, as `CustomerChatSection` of the Next.js app: its
 * chat with the last `limit` notes, the `limit` of the address ("Carica altri
 * messaggi" raises it), or "Avvia una chat". The section shows the
 * last complete view until the next one is complete, as `router.refresh()`
 * kept the page: the notes of a started chat, or the longer list of "Carica
 * altri messaggi", replace it once they are read
 */
export function CustomerChatSection({ customerId }: { customerId: string }) {
  const [searchParams] = useSearchParams()
  const limit = chatLimitOf(searchParams) ?? 5
  const customer = useCustomer(customerId)
  const chatId = customer.data?.chatId ?? null
  const messages = useChatMessages(chatId, limit)

  const shown = useRef<View | undefined>(undefined)
  if (customer.data !== undefined) {
    if (chatId === null) {
      shown.current = { customerId, chat: null }
    } else if (messages.data !== undefined) {
      shown.current = {
        customerId,
        chat: { id: chatId, limit, ...messages.data },
      }
    }
  }
  const view =
    shown.current?.customerId === customerId ? shown.current : undefined
  if (view === undefined) return <Skeleton className="h-80 w-full rounded-md" />
  const { chat } = view

  return (
    // The same element with or without a chat: it outlives the swap. A new
    // customer starts over: no text, draft or announcement carried over
    <CustomerNotes key={customerId}>
      {chat ? (
        <CollassableSection defaultValue={["item-1"]}>
          <CustomerChat
            className="bg-white"
            customerId={customerId}
            chatId={chat.id}
            messages={chat.messages}
            total={chat.total}
            limit={chat.limit}
          />
        </CollassableSection>
      ) : (
        <CustomerNewChat customerId={customerId} limit={limit} />
      )}
    </CustomerNotes>
  )
}

type View = {
  customerId: string
  chat: {
    id: number
    limit: number
    messages: readonly ChatMessage[]
    total: number
  } | null
}
